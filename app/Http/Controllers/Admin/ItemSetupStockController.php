<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveItemRouteRequest;
use App\Models\Inventory\Stocktake;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Store\Store;
use App\Services\Inventory\RefillEngine;
use App\Services\Inventory\StockPermissions;
use App\Services\Inventory\StocktakeService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

/**
 * Where an item is refilled from, and its stock counts, on the item setup page. Stock itself only ever
 * changes through a count (StocktakeService): counting is recorded, then approved, and the ledger books the
 * difference. A count that also holds other items is approved where all of it can be seen (Admin → Counts).
 */
final class ItemSetupStockController extends Controller
{
    public function __construct(
        private readonly StocktakeService $takes,
        private readonly RefillEngine $refills,
        private readonly StockPermissions $permissions,
    ) {
    }

    public function saveRoute(SaveItemRouteRequest $request, Item $item, Store $store): RedirectResponse
    {
        abort_unless($this->permissions->canSetRefillRoute($request->user(), (int) $store->id), 403);

        try {
            $this->refills->setRoute((int) $store->id, $item, $request->validated('sources'), $request->user());
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['sources' => $e->getMessage()]);
        }

        return back()->with('success', "{$store->name}'s refill route for {$item->product_name} saved.");
    }

    /** Count this item's variants at a place: join the count in progress there, or start one and submit it. */
    public function count(Request $request, Item $item, StockLocation $location): RedirectResponse
    {
        abort_unless($this->permissions->isAdmin($request->user()), 403);
        $data = $request->validate(['counts' => ['required', 'array', 'min:1'], 'counts.*' => ['nullable', 'integer', 'min:0', 'max:100000000']]);

        $variantIds = $item->variants()->pluck('id')->all();
        $counts = collect($data['counts'])->filter(fn ($n) => $n !== null && $n !== '');
        if ($counts->isEmpty()) {
            return back()->withErrors(['count' => 'Type at least one counted figure.']);
        }
        if ($counts->keys()->contains(fn ($id): bool => ! in_array((int) $id, $variantIds, true))) {
            return back()->withErrors(['count' => 'A counted line is not a variant of this item.']);
        }

        try {
            $open = Stocktake::query()->where('stock_location_id', $location->id)->whereIn('status', [Stocktake::COUNTING, Stocktake::SUBMITTED])->first();
            if ($open !== null && $open->status === Stocktake::SUBMITTED) {
                return back()->withErrors(['count' => "{$open->reference} at {$location->name} is waiting for approval: approve or void it first."]);
            }

            $take = $open ?? $this->takes->start($location, $request->user(), 'Counted from the item setup page');
            foreach ($counts as $variantId => $counted) {
                $this->takes->count($take, (int) $variantId, (int) $counted, $request->user());
            }

            if ($open === null) {
                $this->takes->submit($take, $request->user());

                return back()->with('success', "Counted at {$location->name}. {$take->reference} waits for approval.");
            }
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['count' => $e->getMessage()]);
        }

        return back()->with('success', "Added to {$open->reference}, which is still being counted at {$location->name}; it is submitted from the stock keeper app.");
    }

    public function approve(Request $request, Item $item, Stocktake $stocktake): RedirectResponse
    {
        abort_unless($this->permissions->isAdmin($request->user()), 403);

        if ($this->hasOtherItems($item, $stocktake)) {
            return back()->withErrors(['count' => "{$stocktake->reference} also counts other items: approve it in Admin → Counts, where all of it shows."]);
        }

        try {
            $this->takes->post($stocktake, $request->user());
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['count' => $e->getMessage()]);
        }

        return back()->with('success', "{$stocktake->reference} approved: the stock now matches the count.");
    }

    public function void(Request $request, Item $item, Stocktake $stocktake): RedirectResponse
    {
        abort_unless($this->permissions->isAdmin($request->user()), 403);

        if ($this->hasOtherItems($item, $stocktake)) {
            return back()->withErrors(['count' => "{$stocktake->reference} also counts other items: void it in Admin → Counts."]);
        }

        try {
            $this->takes->void($stocktake);
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['count' => $e->getMessage()]);
        }

        return back()->with('success', "{$stocktake->reference} voided.");
    }

    private function hasOtherItems(Item $item, Stocktake $stocktake): bool
    {
        return $stocktake->lines()->whereNotNull('counted')->whereNotIn('item_variant_id', $item->variants()->pluck('id'))->exists();
    }
}
