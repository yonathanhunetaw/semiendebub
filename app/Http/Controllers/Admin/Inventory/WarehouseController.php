<?php
namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\AssignFacilityManagersRequest;
use App\Models\Auth\User;
use App\Models\Inventory\FacilityManager;
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

        $warehouses = Warehouse::with(['store', 'managerAssignments.user'])
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
                    'store_name' => $wh->store?->name,
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

        return Inertia::render('Admin/Inventory/Warehouse/index', [
            'warehouses' => $warehouses,
            // Candidates for the two manager slots.
            'assignable_managers' => $this->assignableManagers(),
            'max_managers' => FacilityManager::MAX_PER_FACILITY,
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
            'store_id' => 'nullable|exists:stores,id',
            'manager' => 'nullable|string|max:255',
            'status' => 'required|in:active,inactive',
        ]);

        $warehouse = Warehouse::create($validated);

        Log::info('Warehouse created successfully', ['warehouse_id' => $warehouse->id]);

        return redirect()->route('admin.inventory.warehouse.index')->with('success', 'Warehouse created successfully.');
    }

    public function edit(Warehouse $warehouse)
    {
        Log::info('Viewing warehouse edit page.', ['warehouse_id' => $warehouse->id]);

        $stores = Store::select('id', 'name')->orderBy('name')->get();

        return Inertia::render('Admin/Inventory/Warehouse/Edit', [
            'warehouse' => $warehouse,
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
            'store_id' => 'nullable|exists:stores,id',
            'manager' => 'nullable|string|max:255',
            'status' => 'required|in:active,inactive',
        ]);

        $warehouse->update($validated);

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
}
