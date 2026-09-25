<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Http\Requests\StockKeeper\AdjustStockRequest;
use App\Http\Requests\StockKeeper\ReceiveStockRequest;
use App\Models\StockKeeper\ItemStock;
use App\Services\StockKeeperService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The stock ledger itself: what sits where, plus the two write actions the
 * warehouse desk performs — booking goods in, and correcting a count.
 */
class InventoryController extends Controller
{
    public function __construct(private readonly StockKeeperService $stock)
    {
    }

    public function index(Request $request): Response
    {
        $search = $request->filled('search') ? trim((string) $request->string('search')) : '';
        $locationType = $request->string('location_type')->toString() ?: null;
        $locationId = $request->integer('location_id') ?: null;

        $paginator = $this->stock->paginateStock($search !== '' ? $search : null, $locationType, $locationId);

        return Inertia::render('StockKeeper/Inventory/index', [
            'stock' => collect($paginator->items())
                ->map(fn (ItemStock $row) => $this->stock->presentStockRow($row))
                ->values()
                ->all(),
            'locations' => $this->stock->locations(),
            'variants' => $this->stock->variantOptions($search !== '' ? $search : null)->all(),
            'filters' => [
                'search' => $search,
                'location_type' => $locationType,
                'location_id' => $locationId,
            ],
            'metrics' => $this->stock->metrics(),
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /**
     * Book goods into a location.
     */
    public function receive(ReceiveStockRequest $request): RedirectResponse
    {
        $stock = $this->stock->receive(
            (int) $request->validated('item_variant_id'),
            (string) $request->validated('location_type'),
            (int) $request->validated('location_id'),
            (int) $request->validated('quantity'),
            $request->validated('min_stock_level') !== null
                ? (int) $request->validated('min_stock_level')
                : null,
        );

        return back()->with(
            'success',
            "Received {$request->validated('quantity')} units — {$stock->quantity} now on hand."
        );
    }

    /**
     * Correct a ledger row after a physical recount.
     */
    public function adjust(AdjustStockRequest $request, ItemStock $stock): RedirectResponse
    {
        $delta = $this->stock->adjust(
            $stock,
            (int) $request->validated('counted_quantity'),
            $request->validated('min_stock_level') !== null
                ? (int) $request->validated('min_stock_level')
                : null,
        );

        $direction = $delta === 0 ? 'confirmed' : ($delta > 0 ? 'up' : 'down');

        return back()->with(
            'success',
            $delta === 0
                ? 'Count confirmed — no change.'
                : "Count adjusted {$direction} by " . abs($delta) . ' units.'
        );
    }
}
