<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Services\Inventory\LocationLevels;
use App\Services\Inventory\RefillBoard;
use App\Services\Inventory\StockKeeperVisibility;
use App\Services\ShipmentWorkflowService;
use App\Services\StockKeeperService;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Warehouse desk overview: what is on hand, what is breaching threshold, and
 * what is moving between locations.
 */
class DashboardController extends Controller
{
    public function __construct(
        private readonly StockKeeperService $stock,
        private readonly ShipmentWorkflowService $shipments,
        private readonly RefillBoard $board,
        private readonly LocationLevels $levels,
        private readonly StockKeeperVisibility $visibility,
    ) {
    }

    public function index(): Response
    {
        $stock = $this->stock->forUser(Auth::user());

        $alerts = $stock->lowStockQuery()
            ->with(['itemVariant.item', 'itemVariant.itemColor', 'itemVariant.itemSize'])
            ->orderByRaw('(quantity - min_stock_level) ASC')
            ->limit(8)
            ->get()
            ->map(fn (ItemStock $stock) => $this->stock->presentStockRow($stock))
            ->values()
            ->all();

        $recentMovements = $stock->visibleOnly(ItemStock::query())
            ->with(['itemVariant.item', 'itemVariant.itemColor', 'itemVariant.itemSize'])
            ->orderByDesc('updated_at')
            ->limit(8)
            ->get()
            ->map(fn (ItemStock $stock) => $this->stock->presentStockRow($stock))
            ->values()
            ->all();

        return Inertia::render('StockKeeper/Dashboard/index', [
            'metrics' => $stock->metrics(),
            'alerts' => $alerts,
            'recent_movements' => $recentMovements,
            'locations' => $stock->locations(),
            'assigned_location' => $this->stock->assignedLocation(Auth::user()),
            'todo' => $this->todo(Auth::user()),
            'transfer_summary' => [
                'pending' => Transfer::query()->where('status', 'pending')->count(),
                'in_transit' => Transfer::query()->where('status', 'in_transit')->count(),
                'completed' => Transfer::query()->where('status', 'completed')->count(),
            ],
        ]);
    }

    /**
     * What is waiting on this keeper today, one count per job, each opening
     * the page where it is done.
     *
     * @return array<string, int>
     */
    private function todo(?User $user): array
    {
        $storeId = $user?->store_id !== null ? (int) $user->store_id : null;
        $visible = fn () => $this->shipments->visibleQuery($user);

        $shelving = $storeId !== null && $user !== null ? $this->board->shelvingList($storeId, $user) : null;

        $nodes = $this->visibility->scopeFor($user)['nodes'] ?? null;
        $levelCounts = StockLocation::query()
            ->whereIn('kind', LocationLevels::KINDS)
            ->when($nodes !== null, fn ($q) => $q->whereIn('id', $nodes))
            ->get()
            ->map(fn (StockLocation $location): array => $this->levels->forLocation($location)['counts']);

        return [
            'shipments_to_pick' => $visible()
                ->whereIn('status', [ShipmentWorkflowService::SCHEDULED, ShipmentWorkflowService::PICKING])
                ->when($storeId !== null, fn ($q) => $q->where('origin_store_id', $storeId))
                ->count(),
            'shipments_to_receive' => $visible()
                ->whereIn('status', [ShipmentWorkflowService::IN_TRANSIT, ShipmentWorkflowService::DELIVERED])
                ->when($storeId !== null, fn ($q) => $q->where('destination_store_id', $storeId))
                ->count(),
            'orders_to_pick' => Sale::query()
                ->when($storeId !== null, fn ($q) => $q->forStore($storeId))
                ->awaitingSourcing()
                ->count(),
            'to_shelve' => count($shelving['to_shelve'] ?? []),
            'to_accept' => count($shelving['to_accept'] ?? []),
            'transfers_pending' => Transfer::query()->where('status', 'pending')->count(),
            'levels_low' => (int) $levelCounts->sum('low'),
            'levels_critical' => (int) $levelCounts->sum('critical') + (int) $levelCounts->sum('empty'),
        ];
    }
}
