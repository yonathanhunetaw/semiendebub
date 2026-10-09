<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\AssignLocationManagersRequest;
use App\Http\Requests\Inventory\AssignLocationStaffRequest;
use App\Models\Auth\User;
use App\Services\Admin\ActiveStore;
use App\Models\Inventory\FacilityManager;
use App\Models\Inventory\LocationStaff;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\ItemStock;
use App\Services\Inventory\StockPermissions;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;

/**
 * Every place stock can sit, and who runs each one (STOCK_PLAN.md §5).
 *
 * Main Hub A and B, then each store — the store as a whole, and its Store
 * Shelf, Store (floor) and Remote Hub. A location has any number of managers,
 * each with tick boxes for what they may do there, and any number of stock
 * keepers. A store's managers and stock keepers reach its shelf, floor and
 * Remote Hub too (StockPermissions). A location with neither is run by role.
 */
class LocationController extends Controller
{
    /** Roles that can be put in charge of a location. */
    private const MANAGER_ROLES = ['admin', 'store_manager', 'stock_keeper', 'seller'];

    public function __construct(private readonly ActiveStore $activeStore)
    {
    }

    public function index(): Response
    {
        // The active store's own nodes; the main hubs (no store) and the goods
        // in couriers' hands are network-wide, so only a global admin on "All
        // stores" sees them.
        $scopeIds = $this->activeStore->scopeIds();

        $units = ItemStock::query()
            ->whereNotNull('stock_location_id')
            ->selectRaw('stock_location_id, SUM(quantity) as units')
            ->groupBy('stock_location_id')
            ->pluck('units', 'stock_location_id');

        $nodes = StockLocation::query()
            ->with(['store', 'managerAssignments.user', 'staffAssignments.user'])
            ->where('kind', '!=', StockLocation::KIND_TRANSIT)
            ->when($scopeIds !== null, fn ($q) => $q->whereIn('store_id', $scopeIds ?: [0]))
            ->get();

        $name = fn (?User $user): string => $user === null ? 'Unknown' : (trim($user->first_name.' '.$user->last_name) ?: (string) $user->email);

        $present = fn (StockLocation $node): array => [
            'id' => (int) $node->id,
            'name' => $node->name,
            'code' => $node->code,
            'kind' => $node->kind,
            'kind_label' => $node->kind === StockLocation::KIND_STORE ? 'Whole store' : $node->kind_label,
            'units' => (int) ($units[$node->id] ?? 0),
            'managers' => $node->managerAssignments
                ->sortByDesc('is_primary')
                ->map(fn (FacilityManager $assignment): array => [
                    'id' => (int) $assignment->user_id,
                    'name' => $name($assignment->user),
                    'primary' => (bool) $assignment->is_primary,
                    'abilities' => $assignment->grantedAbilities(),
                ])->values()->all(),
            'staff' => $node->staffAssignments
                ->map(fn (LocationStaff $staff): array => [
                    'id' => (int) $staff->user_id,
                    'name' => $name($staff->user),
                ])->values()->all(),
        ];

        $order = [StockLocation::KIND_SHELF => 0, StockLocation::KIND_BACKROOM => 1, StockLocation::KIND_REMOTE_HUB => 2];

        return Inertia::render('Admin/Inventory/Locations/index', [
            'hubs' => $nodes->where('kind', StockLocation::KIND_MAIN_HUB)->sortBy('name')->map($present)->values(),
            'stores' => $nodes->where('kind', StockLocation::KIND_STORE)->sortBy('name')->map(fn (StockLocation $store): array => [
                'id' => (int) $store->id,
                'name' => $store->name,
                'code' => $store->code,
                // The store as a whole: its managers and stock keepers reach
                // every location below.
                'node' => $present($store),
                'locations' => $nodes->where('parent_id', $store->id)
                    ->sortBy(fn (StockLocation $leaf) => $order[$leaf->kind] ?? 9)
                    ->map($present)->values(),
            ])->values(),
            // Goods in couriers' hands right now: handed out, not yet handed over.
            'in_delivery' => $scopeIds !== null ? 0 : (int) ItemStock::query()
                ->whereIn('stock_location_id', StockLocation::query()->where('kind', StockLocation::KIND_TRANSIT)->select('id'))
                ->sum('quantity'),
            'candidates' => $this->people(self::MANAGER_ROLES),
            'staff_candidates' => $this->people(['stock_keeper']),
            'abilities' => array_map(
                fn (string $ability): array => ['key' => $ability, 'label' => StockPermissions::TICK_LABELS[$ability]],
                FacilityManager::ABILITIES,
            ),
        ]);
    }

    public function assignManagers(AssignLocationManagersRequest $request, StockLocation $stockLocation): RedirectResponse
    {
        abort_if($stockLocation->kind === StockLocation::KIND_TRANSIT, 404);
        $this->authorizeLocation($stockLocation, $request->managerIds());

        try {
            $stockLocation->syncManagers($request->managerIds(), $request->user()?->id, $request->abilities());
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['managers' => $e->getMessage()]);
        }

        return back()->with('success', "Managers of {$stockLocation->name} updated.");
    }

    public function assignStaff(AssignLocationStaffRequest $request, StockLocation $stockLocation): RedirectResponse
    {
        abort_if(in_array($stockLocation->kind, [StockLocation::KIND_TRANSIT], true), 404);
        $this->authorizeLocation($stockLocation, $request->staffIds());

        $stockLocation->syncStaff($request->staffIds(), $request->user()?->id);

        return back()->with('success', "Stock keepers of {$stockLocation->name} updated.");
    }

    /**
     * @param  array<int, string>  $roles
     * @return array<int, array{id: int, name: string, role: string}>
     */
    private function people(array $roles): array
    {
        return $this->activeStore->apply(User::query())
            ->whereIn('role', $roles)
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'last_name', 'email', 'role'])
            ->map(fn (User $user): array => [
                'id' => (int) $user->id,
                'name' => trim($user->first_name.' '.$user->last_name) ?: (string) $user->email,
                'role' => $user->roleKey(),
            ])->values()->all();
    }

    /**
     * A store admin manages their own stores' locations, with their own
     * stores' people; a main hub (no store) is a global admin's.
     *
     * @param  array<int, int>  $userIds
     */
    private function authorizeLocation(StockLocation $location, array $userIds): void
    {
        abort_unless($this->activeStore->allows($location->store_id !== null ? (int) $location->store_id : null), 404);

        if (! $this->activeStore->isGlobal()) {
            $outsiders = User::query()->whereKey($userIds)->get(['id', 'store_id'])
                ->reject(fn (User $user): bool => $this->activeStore->allows($user->store_id !== null ? (int) $user->store_id : null));

            abort_if($outsiders->isNotEmpty(), 403, 'You can only assign your own stores\' people.');
        }
    }
}
