<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Models\StockKeeper\ItemStock;
use App\Services\StockKeeperService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Replenishment signals: every ledger row that has fallen to or below the
 * minimum the warehouse desk set for it.
 */
class StockAlertController extends Controller
{
    public function __construct(private readonly StockKeeperService $stock)
    {
    }

    public function index(Request $request): Response
    {
        $search = $request->filled('search') ? trim((string) $request->string('search')) : '';
        $severity = $request->string('severity')->toString() ?: null;

        $paginator = $this->stock->paginateAlerts(
            $search !== '' ? $search : null,
            in_array($severity, ['low_stock', 'out_of_stock'], true) ? $severity : null,
        );

        $metrics = $this->stock->metrics();

        return Inertia::render('StockKeeper/StockAlerts/index', [
            'alerts' => collect($paginator->items())
                ->map(fn (ItemStock $row) => $this->stock->presentStockRow($row))
                ->values()
                ->all(),
            'filters' => [
                'search' => $search,
                'severity' => $severity,
            ],
            'summary' => [
                'low_stock' => $metrics['low_stock'],
                'out_of_stock' => $metrics['out_of_stock'],
                'tracked_skus' => $metrics['tracked_skus'],
            ],
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }
}
