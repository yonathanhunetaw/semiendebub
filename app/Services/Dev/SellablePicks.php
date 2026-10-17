<?php

declare(strict_types=1);

namespace App\Services\Dev;

use App\Models\Inventory\StockReservation;
use App\Models\Item\Item;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\PriceProvider;
use App\Services\Seller\SellerCatalog;

/**
 * Finds items a seller can really sell right now, for the dev fixtures
 * (e2e:prepare on the throwaway copy, dev:demo-staff on dev). Reads only.
 */
final class SellablePicks
{
    public function __construct(private readonly SellerCatalog $catalog)
    {
    }

    /**
     * The first store that can sell $wanted items whose every variant is
     * priced and has free stock on its shelf or floor, so whichever variant
     * the add-to-cart sheet starts on can be sold and picked. Items with the
     * fewest variants come first.
     *
     * @return array{0: ?Store, 1: array<int, array<string, mixed>>}
     */
    public function pick(int $wanted): array
    {
        foreach (Store::query()->orderBy('id')->get() as $store) {
            $leaves = $this->catalog->storeLeaves((int) $store->id);
            $locations = [...$leaves['shelf'], ...$leaves['floor']];

            if ($locations === []) {
                continue;
            }

            $held = StockReservation::query()
                ->where('store_id', $store->id)
                ->where('status', StockReservation::STATUS_OPEN)
                ->whereIn('stock_location_id', $locations)
                ->groupBy('item_variant_id')
                ->selectRaw('item_variant_id, SUM(quantity) AS quantity')
                ->pluck('quantity', 'item_variant_id');

            $picks = Item::query()
                ->withCount('variants')
                ->having('variants_count', '>', 0)
                ->orderBy('variants_count')
                ->orderBy('id')
                ->with('variants')
                ->get()
                // Lazy, so the per-item checks stop once enough items pass.
                ->lazy()
                ->filter(function (Item $item) use ($store, $locations, $held): bool {
                    $storeVariants = StoreVariant::query()
                        ->where('store_id', $store->id)
                        ->where('active', true)
                        ->whereIn('item_variant_id', $item->variants->pluck('id'))
                        ->with(['stocks' => fn ($stock) => $stock->whereIn('stock_location_id', $locations)])
                        ->get();

                    if ($storeVariants->count() !== $item->variants->count()) {
                        return false;
                    }

                    return $storeVariants->every(fn (StoreVariant $storeVariant): bool =>
                        (int) $storeVariant->stocks->sum('quantity') - (int) ($held[$storeVariant->item_variant_id] ?? 0) >= 10
                        && PriceProvider::getPriceLadder((int) $storeVariant->id, (int) $store->id) !== []);
                })
                ->take($wanted)
                ->map(fn (Item $item): array => [
                    'item_id' => (int) $item->id,
                    'name' => (string) $item->product_name,
                    'variants' => (int) $item->variants_count,
                ])
                ->values();

            if ($picks->count() === $wanted) {
                return [$store, $picks->all()];
            }
        }

        return [null, []];
    }
}
