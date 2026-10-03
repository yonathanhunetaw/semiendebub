<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Services\Inventory\SellerLocationBoard;
use App\Services\Inventory\ShelfMatrix;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;

/**
 * One stock location, as a seller sees it: their own shelf, store and remote
 * hub, or one of the shared main hubs. A shelf opens as its bin matrix — one
 * item per bin, with a band and a refill button each.
 */
class LocationController extends Controller
{
    public function __construct(
        private readonly SellerLocationBoard $board,
        private readonly ShelfMatrix $matrix,
    ) {
    }

    public function show(Request $request, StockLocation $location): Response
    {
        $storeId = $request->user()?->store_id;
        $storeId = $storeId !== null ? (int) $storeId : null;

        abort_unless($this->board->visibleTo($location, $storeId), 404);

        $isShelf = $location->kind === StockLocation::KIND_SHELF;

        return Inertia::render('Seller/Locations/Show', [
            'location' => [
                'id' => $location->id,
                'kind' => $location->kind,
                'name' => $location->name,
                'code' => $location->code,
            ],
            'strip' => $this->board->strip($storeId),
            'items' => $this->board->stock($location),
            'shelfLines' => $isShelf ? $this->board->shelfLines($location) : [],
            'rowSize' => SellerLocationBoard::SHELF_ROW_SIZE,
            // Guarded until the shelf_item_bands migration has run everywhere:
            // the page must not fail on a database that has not caught up.
            'matrix' => $isShelf && \Illuminate\Support\Facades\Schema::hasTable('shelf_item_bands')
                ? $this->matrix->forShelf($location, max(1, $request->integer('tier', 1)))
                : null,
            'canEditShelf' => $isShelf && $this->mayRunShelf($request, $location),
        ]);
    }

    /** Set an item's band on the shelf, in one of its pack units. */
    public function updateBand(Request $request, StockLocation $location, Item $item): RedirectResponse
    {
        abort_unless($this->mayRunShelf($request, $location), 403);

        $data = $request->validate([
            'item_packaging_type_id' => ['nullable', 'integer', 'exists:item_packaging_types,id'],
            'max' => ['required', 'integer', 'min:1', 'max:100000'],
            'refill' => ['required', 'integer', 'min:0', 'max:100000'],
            'critical' => ['required', 'integer', 'min:0', 'max:100000'],
        ]);

        try {
            $this->matrix->setBand(
                $location,
                $item,
                isset($data['item_packaging_type_id']) ? (int) $data['item_packaging_type_id'] : null,
                (int) $data['max'],
                (int) $data['refill'],
                (int) $data['critical'],
                $request->user(),
            );
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['band' => $e->getMessage()]);
        }

        return back()->with('success', "{$item->product_name}'s shelf band saved.");
    }

    /** Ask for the shortfall to come out from the store floor. */
    public function requestRefill(Request $request, StockLocation $location, Item $item): RedirectResponse
    {
        abort_unless($this->mayRunShelf($request, $location), 403);

        try {
            $transfer = $this->matrix->requestRefill($location, $item, $request->user());
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Refill {$transfer->reference} raised: {$transfer->quantity} from the store floor.");
    }

    /** The seller's own store's shelf, or a shelf they manage. */
    private function mayRunShelf(Request $request, StockLocation $location): bool
    {
        $user = $request->user();

        if ($location->kind !== StockLocation::KIND_SHELF || $user === null) {
            return false;
        }

        return (int) $location->store_id === (int) $user->store_id
            || $location->isManagedBy($user)
            || in_array($user->roleKey(), ['admin', 'dev'], true);
    }
}
