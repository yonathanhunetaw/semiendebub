<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\RaiseShelfRefillRequest;
use App\Http\Requests\Inventory\UpdateRefillRouteRequest;
use App\Http\Requests\Inventory\UpdateShelfBandRequest;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Services\Inventory\PackagingLadder;
use App\Services\Inventory\RefillEngine;
use App\Services\Inventory\SellerLocationBoard;
use App\Services\Inventory\ShelfMatrix;
use App\Services\Inventory\StockPermissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;

/**
 * One stock location, as a seller sees it: their own shelf, store and remote
 * hub, or one of the shared main hubs. A shelf opens as its bin matrix — one
 * item per bin, each with its lines.
 *
 * Everyone in the store sees the shelf; only its managers change what is on
 * it (StockPermissions). Refills go through RefillEngine.
 */
class LocationController extends Controller
{
    public function __construct(
        private readonly SellerLocationBoard $board,
        private readonly ShelfMatrix $matrix,
        private readonly RefillEngine $refills,
        private readonly StockPermissions $permissions,
    ) {
    }

    public function show(Request $request, StockLocation $location): Response
    {
        $user = $request->user();
        $storeId = $user?->store_id;
        $storeId = $storeId !== null ? (int) $storeId : null;

        $isShelf = $location->kind === StockLocation::KIND_SHELF;
        // A Remote Hub keeps lines per item the same way a shelf does.
        $hasBins = $isShelf || $location->kind === StockLocation::KIND_REMOTE_HUB;

        abort_unless(
            $this->board->visibleTo($location, $storeId)
                || ($isShelf && $this->permissions->canViewShelf($user, $location)),
            404,
        );

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
            // Guarded until the shelf migrations have run everywhere: the page
            // must not fail on a database that has not caught up.
            'matrix' => $hasBins && Schema::hasTable('shelf_item_bands') && Schema::hasTable('refill_requests')
                ? $this->matrix->forShelf($location, max(1, $request->integer('tier', 1)))
                : null,
            'canEditShelf' => $hasBins && $this->permissions->canEditPlanogram($user, $location),
            'canRaiseRefill' => $hasBins && $this->permissions->canRaiseRefill($user, $location),
            'canSetRoute' => $isShelf && $location->store_id !== null
                && $this->permissions->canSetRefillRoute($user, (int) $location->store_id),
        ]);
    }

    /**
     * Items a manager may put on this shelf: active, listed by its store, and
     * not already given a bin here — with their pack units for the lines.
     */
    public function assignable(Request $request, StockLocation $location, PackagingLadder $ladder): JsonResponse
    {
        abort_unless($this->permissions->canEditPlanogram($request->user(), $location), 403);

        $search = trim((string) $request->query('q', ''));

        $items = Item::query()
            ->where('status', 'active')
            ->whereHas('variants.storeVariants', fn ($q) => $q->where('store_id', $location->store_id))
            ->whereNotIn('id', ShelfItemBand::query()->where('stock_location_id', $location->id)->select('item_id'))
            ->when($search !== '', fn ($q) => $q->where('product_name', 'like', '%'.$search.'%'))
            ->orderBy('product_name')
            ->limit(20)
            ->get(['id', 'product_name']);

        $ladder->forItems($items->pluck('id')->all());

        return response()->json([
            'items' => $items->map(fn (Item $item): array => [
                'id' => (int) $item->id,
                'name' => (string) $item->product_name,
                'units' => array_map(
                    fn (array $tier): array => ['id' => $tier['id'], 'name' => $tier['name'], 'pieces' => (int) $tier['pieces']],
                    $ladder->forItem((int) $item->id),
                ),
            ])->all(),
        ]);
    }

    /** Assign an item to the shelf, or change its lines, in one of its pack units. */
    public function updateBand(UpdateShelfBandRequest $request, StockLocation $location, Item $item): RedirectResponse
    {
        try {
            $this->matrix->setBand(
                $location,
                $item,
                $request->validated('item_packaging_type_id') !== null ? (int) $request->validated('item_packaging_type_id') : null,
                (int) $request->validated('max'),
                (int) $request->validated('refill'),
                (int) $request->validated('critical'),
                $request->user(),
            );
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['band' => $e->getMessage()]);
        }

        return back()->with('success', "{$item->product_name}'s shelf band saved.");
    }

    /** Take an item off the shelf's planogram. */
    public function destroyBand(Request $request, StockLocation $location, Item $item): RedirectResponse
    {
        abort_unless($this->permissions->canEditPlanogram($request->user(), $location), 403);

        try {
            $removed = $this->matrix->removeBand($location, $item);
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with(
            $removed ? 'success' : 'error',
            $removed ? "{$item->product_name} is off the shelf's planogram." : "{$item->product_name} had no bin on this shelf.",
        );
    }

    /** Raise a refill for one bin by hand. */
    public function requestRefill(RaiseShelfRefillRequest $request, StockLocation $location, Item $item): RedirectResponse
    {
        try {
            $outcome = $this->refills->raise(
                $location,
                $item,
                RefillRequest::ORIGIN_MANUAL,
                $request->user(),
                $request->validated('start_at'),
            );
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with($outcome['result'] === 'raised' ? 'success' : 'error', $outcome['message']);
    }

    /** Set where the store refills this item from, in order. */
    public function updateRoute(UpdateRefillRouteRequest $request, StockLocation $location, Item $item): RedirectResponse
    {
        try {
            $this->refills->setRoute((int) $location->store_id, $item, $request->validated('sources'), $request->user());
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['sources' => $e->getMessage()]);
        }

        return back()->with('success', "{$item->product_name}'s refill route saved.");
    }
}
