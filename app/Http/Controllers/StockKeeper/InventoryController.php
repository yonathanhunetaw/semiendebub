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

        /*
         * Items, not ledger rows.
         *
         * This screen used to list `item_stocks` directly — one row per variant
         * per location, 4,907 of them — and headline a distinct variant count,
         * so a desk holding 182 products read "1,629 variants". It now lists one
         * row per item, in that location's own units, with the variant rows
         * underneath for the receive and recount actions, which are always
         * written against a variant.
         */
        $page = $request->integer('page') ?: 1;

        // The ledger as this keeper sees it: only the locations they manage,
        // or their own store's, or everything when neither applies.
        $stock = $this->stock->forUser($request->user());

        $items = $stock->paginateItems(
            $search !== '' ? $search : null,
            $locationType,
            $locationId,
            $page,
        );

        return Inertia::render('StockKeeper/Inventory/index', [
            'items' => $items['rows'],
            // The variant-level ledger, still available and still paginated,
            // for the keeper who needs the row behind a figure.
            'stock' => collect($stock->paginateStock($search !== '' ? $search : null, $locationType, $locationId)->items())
                ->map(fn (ItemStock $row) => $stock->presentStockRow($row))
                ->values()
                ->all(),
            'locations' => $stock->locations(),
            'variants' => $this->stock->variantOptions($search !== '' ? $search : null)->all(),
            'filters' => [
                'search' => $search,
                'location_type' => $locationType,
                'location_id' => $locationId,
            ],
            'metrics' => $stock->metrics($locationType, $locationId),
            'pagination' => [
                'current_page' => $items['page'],
                'last_page' => $items['last_page'],
                'total' => $items['total_items'],
            ],
        ]);
    }

    /**
     * The variant rows behind one item, fetched when a row is expanded.
     */
    public function variants(Request $request, int $item): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'variants' => $this->stock->forUser($request->user())->variantsForItem(
                $item,
                $request->string('location_type')->toString() ?: null,
                $request->integer('location_id') ?: null,
            ),
        ]);
    }

    /**
     * Book goods into a location.
     */
    public function receive(ReceiveStockRequest $request): RedirectResponse
    {
        if (! $this->stock->mayOperateAddress($request->user(), (string) $request->validated('location_type'), (int) $request->validated('location_id'))) {
            return back()->with('error', 'You do not manage that location, so you cannot book stock into it.');
        }

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
        if (! $this->stock->mayOperateRow($request->user(), $stock)) {
            return back()->with('error', 'You do not manage that location, so you cannot recount it.');
        }

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
