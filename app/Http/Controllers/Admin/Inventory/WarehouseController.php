<?php
namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\AssignFacilityManagersRequest;
use App\Models\Auth\User;
use App\Models\Inventory\FacilityManager;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Inventory\ItemStock;
use App\Models\Store\Store;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\Log;

class WarehouseController extends Controller
{
    public function index()
    {
        Log::info('Viewing warehouse index page.');

        $warehouses = Warehouse::with(['stores:id,name', 'managerAssignments.user'])
            ->withCount('stocks')
            ->withSum('stocks as total_units', 'quantity')
            ->orderBy('name')
            ->get()
            ->map(function ($wh) {
                return [
                    'id' => $wh->id,
                    'name' => $wh->name,
                    'address' => $wh->address,
                    'code' => $wh->code,
                    // A warehouse may serve several stores.
                    'store_name' => $wh->stores->pluck('name')->join(', ') ?: null,
                    'store_names' => $wh->stores->pluck('name')->values(),
                    'stocks_count' => $wh->stocks_count,
                    'total_units' => (int) $wh->total_units,
                    // The one or two users who may oversee this warehouse.
                    // `manager` below is the legacy free-text name and is kept
                    // only for display; authorization reads these assignments.
                    'managers' => $this->presentManagers($wh),
                    'manager_name' => $wh->manager,
                    'can_oversee' => request()->user()?->can('oversee', $wh) ?? false,
                ];
            })->toArray();

        $stockLines = ItemStock::whereHasMorph('location', [Warehouse::class])
            ->with([
                'itemVariant.item',
                'itemVariant.itemColor',
                'itemVariant.itemSize',
                'location'
            ])
            ->get()
            ->map(function ($stock) {
                $itemVariant = $stock->itemVariant;

                return [
                    'id' => $stock->id,
                    'item_name' => $itemVariant?->item?->product_name ?? 'Unknown',
                    'sku' => $itemVariant?->sku,
                    'variant_label' => collect([
                        $itemVariant?->itemColor?->name,
                        $itemVariant?->itemSize?->name,
                    ])->filter()->join(' / ') ?: 'Standard',
                    'location_name' => $stock->location?->name ?? 'Unknown',
                    'quantity' => $stock->quantity,
                    'min_stock_level' => $stock->min_stock_level,
                    'is_low' => $stock->min_stock_level !== null && $stock->quantity <= $stock->min_stock_level,
                ];
            })->values();

        $totalUnits = $stockLines->sum('quantity');
        $lowStockCount = $stockLines->where('is_low', true)->count();

        // A Remote Hub is a warehouse too, but it hangs off a store in the
        // location tree and has no warehouses row, so it is listed apart.
        $hubUnits = ItemStock::query()
            ->whereNotNull('stock_location_id')
            ->selectRaw('stock_location_id, SUM(quantity) as units, COUNT(*) as line_count')
            ->groupBy('stock_location_id')
            ->get()
            ->keyBy('stock_location_id');

        $remoteHubs = StockLocation::query()
            ->with('store:id,name')
            ->where('kind', StockLocation::KIND_REMOTE_HUB)
            ->orderBy('store_id')
            ->get()
            ->map(fn (StockLocation $hub): array => [
                'id' => (int) $hub->id,
                'name' => $hub->name,
                'code' => $hub->code,
                'address' => $hub->address,
                'store_id' => $hub->store_id,
                'store_name' => $hub->store?->name,
                'stocks_count' => (int) ($hubUnits[$hub->id]->line_count ?? 0),
                'total_units' => (int) ($hubUnits[$hub->id]->units ?? 0),
            ])->values();

        return Inertia::render('Admin/Inventory/Warehouse/index', [
            'warehouses' => $warehouses,
            'remoteHubs' => $remoteHubs,
            // Candidates for manager. Any number may be appointed.
            'assignable_managers' => $this->assignableManagers(),
            'max_managers' => null,
            'totalWarehouses' => count($warehouses),
            'totalUnits' => $totalUnits,
            'lowStockCount' => $lowStockCount,
            'stockLines' => $stockLines,
        ]);
    }

    /**
     * A warehouse is a Main Hub in the location tree; its page is the
     * Locations screen (STOCK_PLAN.md §5: /warehouse redirects there).
     */
    public function show(Warehouse $warehouse): \Illuminate\Http\RedirectResponse
    {
        return redirect()->route('admin.inventory.stock-locations.index');
    }

    public function create()
    {
        Log::info('Viewing warehouse create page.');

        $stores = Store::select('id', 'name')->orderBy('name')->get();

        return Inertia::render('Admin/Inventory/Warehouse/Create', [
            'stores' => $stores
        ]);
    }

    public function store(Request $request)
    {
        Log::info('Attempting to create a new warehouse', ['request_data' => $request->all()]);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:255|unique:warehouses,code',
            'address' => 'nullable|string|max:500',
            // `store_id` (one store) is still accepted from older callers.
            'store_id' => 'nullable|exists:stores,id',
            'store_ids' => 'nullable|array',
            'store_ids.*' => 'integer|distinct|exists:stores,id',
            'manager' => 'nullable|string|max:255',
            'status' => 'required|in:active,inactive',
        ]);

        $warehouse = Warehouse::create($this->attributes($validated));
        $warehouse->stores()->sync($this->storeIds($validated));

        Log::info('Warehouse created successfully', ['warehouse_id' => $warehouse->id]);

        return redirect()->route('admin.inventory.warehouse.index')->with('success', 'Warehouse created successfully.');
    }

    public function edit(Warehouse $warehouse)
    {
        Log::info('Viewing warehouse edit page.', ['warehouse_id' => $warehouse->id]);

        $stores = Store::select('id', 'name')->orderBy('name')->get();

        return Inertia::render('Admin/Inventory/Warehouse/Edit', [
            'warehouse' => $warehouse->toArray() + [
                'store_ids' => $warehouse->stores()->pluck('stores.id')->map(fn ($id): int => (int) $id)->values(),
            ],
            'stores' => $stores
        ]);
    }

    public function update(Request $request, Warehouse $warehouse)
    {
        Log::info('Attempting to update warehouse', ['warehouse_id' => $warehouse->id, 'request_data' => $request->all()]);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:255|unique:warehouses,code,' . $warehouse->id,
            'address' => 'nullable|string|max:500',
            // `store_id` (one store) is still accepted from older callers.
            'store_id' => 'nullable|exists:stores,id',
            'store_ids' => 'nullable|array',
            'store_ids.*' => 'integer|distinct|exists:stores,id',
            'manager' => 'nullable|string|max:255',
            'status' => 'required|in:active,inactive',
        ]);

        $warehouse->update($this->attributes($validated));
        $warehouse->stores()->sync($this->storeIds($validated));

        Log::info('Warehouse updated successfully', ['warehouse_id' => $warehouse->id]);

        return redirect()->route('admin.inventory.warehouse.index')->with('success', 'Warehouse updated successfully.');
    }

    /**
     * Appoint the one or two users who oversee this warehouse.
     *
     * The first id is the primary. An empty list leaves the warehouse
     * admin-only rather than open to everyone — see WarehousePolicy::oversee().
     *
     * Appointing is an admin act (AssignFacilityManagersRequest authorizes it),
     * so a manager cannot add a colleague or replace themselves.
     */
    public function assignManagers(AssignFacilityManagersRequest $request, Warehouse $warehouse): RedirectResponse
    {
        $warehouse->syncManagers($request->managerIds(), $request->user()?->id);

        Log::info('Warehouse managers assigned', [
            'warehouse_id' => $warehouse->id,
            'manager_ids' => $request->managerIds(),
            'assigned_by' => $request->user()?->id,
        ]);

        return back()->with('success', 'Warehouse managers updated.');
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function presentManagers(Warehouse $warehouse): array
    {
        return $warehouse->managerAssignments
            ->map(fn (FacilityManager $assignment): array => [
                'id' => (int) $assignment->user_id,
                'name' => trim((string) ($assignment->user?->first_name . ' ' . $assignment->user?->last_name))
                    ?: (string) ($assignment->user?->email ?? 'Unknown user'),
                'is_primary' => (bool) $assignment->is_primary,
            ])
            ->values()
            ->all();
    }

    /**
     * Staff who can hold a warehouse manager slot.
     *
     * Deliberately not every user: a warehouse is overseen by someone who works
     * in the inventory chain, so the list is the roles that do.
     *
     * @return array<int, array<string, mixed>>
     */
    private function assignableManagers(): array
    {
        return User::query()
            ->whereHas('roles', fn ($query) => $query->whereIn('name', ['admin', 'store_manager', 'stock_keeper', 'seller']))
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'last_name', 'email'])
            ->map(fn (User $user): array => [
                'id' => (int) $user->id,
                'name' => trim($user->first_name . ' ' . $user->last_name) ?: $user->email,
                'email' => $user->email,
            ])
            ->all();
    }

    public function destroy(Warehouse $warehouse)
    {
        Log::info('Attempting to delete warehouse', ['warehouse_id' => $warehouse->id]);

        $warehouse->delete();

        Log::info('Warehouse deleted successfully', ['warehouse_id' => $warehouse->id]);

        return redirect()->route('admin.inventory.warehouse.index')->with('success', 'Warehouse deleted successfully.');
    }

    /**
     * The warehouse's own columns. The legacy `store_id` keeps the first
     * served store while the column is still around.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function attributes(array $validated): array
    {
        $storeIds = $this->storeIds($validated);
        unset($validated['store_ids']);

        return ['store_id' => $storeIds[0] ?? null] + $validated;
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<int, int>
     */
    private function storeIds(array $validated): array
    {
        $ids = $validated['store_ids'] ?? (isset($validated['store_id']) ? [$validated['store_id']] : []);

        return array_values(array_unique(array_map('intval', $ids)));
    }
}
