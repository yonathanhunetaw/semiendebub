<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
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
    public function __construct(private readonly StockKeeperService $stock)
    {
    }

    public function index(): Response
    {
        $alerts = $this->stock->lowStockQuery()
            ->with(['itemVariant.item', 'itemVariant.itemColor', 'itemVariant.itemSize'])
            ->orderByRaw('(quantity - min_stock_level) ASC')
            ->limit(8)
            ->get()
            ->map(fn (ItemStock $stock) => $this->stock->presentStockRow($stock))
            ->values()
            ->all();

        $recentMovements = ItemStock::query()
            ->with(['itemVariant.item', 'itemVariant.itemColor', 'itemVariant.itemSize'])
            ->orderByDesc('updated_at')
            ->limit(8)
            ->get()
            ->map(fn (ItemStock $stock) => $this->stock->presentStockRow($stock))
            ->values()
            ->all();

        return Inertia::render('StockKeeper/Dashboard/index', [
            'metrics' => $this->stock->metrics(),
            'alerts' => $alerts,
            'recent_movements' => $recentMovements,
            'locations' => $this->stock->locations(),
            'assigned_location' => $this->stock->assignedLocation(Auth::user()),
            'transfer_summary' => [
                'pending' => Transfer::query()->where('status', 'pending')->count(),
                'in_transit' => Transfer::query()->where('status', 'in_transit')->count(),
                'completed' => Transfer::query()->where('status', 'completed')->count(),
            ],
        ]);
    }
}
