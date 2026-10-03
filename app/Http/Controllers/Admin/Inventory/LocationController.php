<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\AssignLocationManagersRequest;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\ItemStock;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Every place stock can sit, and who runs each one (STOCK_PLAN.md §5).
 *
 * Main Hub A and B, then each store with its Store Shelf, Store (floor) and
 * Remote Hub. A location's managers are the people who hand stock out of it
 * and take stock into it — dispatching a transfer, agreeing a shipment as its
 * dock, receiving from a courier. A location with no managers is run by role,
 * as before.
 */
class LocationController extends Controller
{
    /** Roles that can be put in charge of a location. */
    private const MANAGER_ROLES = ['admin', 'store_manager', 'stock_keeper', 'seller'];

    public function index(): Response
    {
        $units = ItemStock::query()
            ->whereNotNull('stock_location_id')
            ->selectRaw('stock_location_id, SUM(quantity) as units')
            ->groupBy('stock_location_id')
            ->pluck('units', 'stock_location_id');

        $nodes = StockLocation::query()
            ->with(['store', 'managers'])
            ->where('kind', '!=', StockLocation::KIND_TRANSIT)
            ->get();

        $present = fn (StockLocation $node): array => [
            'id' => (int) $node->id,
            'name' => $node->name,
            'code' => $node->code,
            'kind' => $node->kind,
            'kind_label' => $node->kind_label,
            'units' => (int) ($units[$node->id] ?? 0),
            'managers' => $node->managers->map(fn (User $user): array => [
                'id' => (int) $user->id,
                'name' => trim($user->first_name.' '.$user->last_name) ?: (string) $user->email,
                'primary' => (bool) $user->pivot->is_primary,
            ])->values()->all(),
        ];

        $order = [StockLocation::KIND_SHELF => 0, StockLocation::KIND_BACKROOM => 1, StockLocation::KIND_REMOTE_HUB => 2];

        return Inertia::render('Admin/Inventory/Locations/index', [
            'hubs' => $nodes->where('kind', StockLocation::KIND_MAIN_HUB)->sortBy('name')->map($present)->values(),
            'stores' => $nodes->where('kind', StockLocation::KIND_STORE)->sortBy('name')->map(fn (StockLocation $store): array => [
                'id' => (int) $store->id,
                'name' => $store->name,
                'code' => $store->code,
                'locations' => $nodes->where('parent_id', $store->id)
                    ->sortBy(fn (StockLocation $leaf) => $order[$leaf->kind] ?? 9)
                    ->map($present)->values(),
            ])->values(),
            // Goods in couriers' hands right now: handed out, not yet handed over.
            'in_delivery' => (int) ItemStock::query()
                ->whereIn('stock_location_id', StockLocation::query()->where('kind', StockLocation::KIND_TRANSIT)->select('id'))
                ->sum('quantity'),
            'candidates' => User::query()
                ->whereIn('role', self::MANAGER_ROLES)
                ->orderBy('first_name')
                ->get(['id', 'first_name', 'last_name', 'email', 'role'])
                ->map(fn (User $user): array => [
                    'id' => (int) $user->id,
                    'name' => trim($user->first_name.' '.$user->last_name) ?: (string) $user->email,
                    'role' => $user->roleKey(),
                ])->values(),
        ]);
    }

    public function assignManagers(AssignLocationManagersRequest $request, StockLocation $stockLocation): RedirectResponse
    {
        abort_if($stockLocation->kind === StockLocation::KIND_TRANSIT, 404);

        $stockLocation->syncManagers($request->managerIds(), $request->user()?->id);

        return back()->with('success', "Managers of {$stockLocation->name} updated.");
    }
}
