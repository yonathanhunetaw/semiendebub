<?php

declare(strict_types=1);

namespace App\Services\Item;

use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\Stocktake;
use App\Models\Inventory\StocktakeLine;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantIndividualPrice;
use App\Models\Store\StoreVariantSellerPrice;
use Illuminate\Support\Collection;

/**
 * How ready an item is to be sold: the one definition, read by the item setup page (and, later,
 * the bulk tools), so nothing describes a rule the code does not check.
 *
 * Checks are required or optional. The percentage is done ÷ (required + optional that are done):
 * an optional check never lowers it, and one that is filled in counts as a success.
 *
 * Two kinds of part: the item itself (name, category, picture, variants, barcodes, and that some
 * store sells it) and, for every store that has the item, that store's part (deployed, priced,
 * a shelf bin, an approved count, plus optional extras). Pure reads; changes nothing.
 */
final class ItemReadiness
{
    /**
     * @return array{
     *     percent: int,
     *     item: array<string, mixed>,
     *     stores: array<int, array<string, mixed>>
     * }
     */
    public function for(Item $item): array
    {
        $item->loadMissing(['variants']);
        $variants = $item->variants;
        $variantIds = $variants->pluck('id')->map(fn ($id): int => (int) $id)->all();

        $storeVariants = StoreVariant::query()->whereIn('item_variant_id', $variantIds)->get()->groupBy('store_id');
        $sold = $storeVariants->contains(fn (Collection $rows): bool => $rows->where('active', true)->isNotEmpty());

        $itemChecks = [
            $this->check('name', 'Has a name', true, trim((string) $item->product_name) !== ''),
            $this->check('category', 'Has a category', true, $item->item_category_id !== null && $item->category !== null),
            $this->check('picture', 'Has at least one picture', true, $this->hasPicture($item)),
            $this->check('variants', 'Has at least one variant', true, $variants->isNotEmpty()),
            $this->check('packaging', 'Every variant has its packaging', true, $variants->isNotEmpty() && $variants->every(fn ($v): bool => $v->item_packaging_type_id !== null),
                $this->countOf($variants, fn ($v): bool => $v->item_packaging_type_id !== null)),
            $this->check('barcode', 'Every variant has a barcode', true, $variants->isNotEmpty() && $variants->every(fn ($v): bool => trim((string) $v->barcode) !== ''),
                $this->countOf($variants, fn ($v): bool => trim((string) $v->barcode) !== '')),
            $this->check('description', 'Has a description', false, trim((string) ($item->description ?? '')) !== ''),
            $this->check('sold', 'Sold in at least one store', true, $sold),
        ];

        $stores = [];
        foreach ($storeVariants as $storeId => $rows) {
            $store = Store::query()->find($storeId);
            if ($store === null) {
                continue;
            }
            $stores[(int) $storeId] = $this->forStore($item, $store, $variants, $rows);
        }

        $all = array_merge($itemChecks, ...array_map(fn (array $s): array => $s['checks'], $stores));

        return [
            'percent' => $this->percent($all),
            'item' => $this->part($itemChecks),
            'stores' => $stores,
        ];
    }

    /**
     * @param  Collection<int, mixed>  $variants
     * @param  Collection<int, StoreVariant>  $rows  the item's store variants in this store
     * @return array<string, mixed>
     */
    private function forStore(Item $item, Store $store, Collection $variants, Collection $rows): array
    {
        $byVariant = $rows->keyBy('item_variant_id');
        $places = StockLocation::query()->where('store_id', $store->id)->get()->groupBy('kind');
        $shelf = $places[StockLocation::KIND_SHELF]->first() ?? null;
        $others = collect([$places[StockLocation::KIND_BACKROOM] ?? [], $places[StockLocation::KIND_REMOTE_HUB] ?? []])->flatten(1)->pluck('id');
        $placeIds = collect([$places[StockLocation::KIND_SHELF] ?? [], $places[StockLocation::KIND_BACKROOM] ?? [], $places[StockLocation::KIND_REMOTE_HUB] ?? []])->flatten(1)->pluck('id');
        $rowIds = $rows->pluck('id');

        $deployed = $variants->isNotEmpty() && $variants->every(fn ($v): bool => $byVariant->has($v->id)) && $rows->where('active', true)->isNotEmpty();
        $priced = $rows->isNotEmpty() && $rows->every(fn (StoreVariant $r): bool => $this->price($r) > 0);

        $checks = [
            $this->check('deployed', 'Deployed to the store (every variant)', true, $deployed, $rows->count().' of '.$variants->count().' variants'),
            $this->check('priced', 'Store price above zero on every variant', true, $priced,
                $rows->filter(fn (StoreVariant $r): bool => $this->price($r) > 0)->count().' of '.$rows->count().' priced'),
        ];

        if ($shelf !== null) {
            $checks[] = $this->check('bin', 'Has a shelf bin with its limits', true,
                ShelfItemBand::query()->where('stock_location_id', $shelf->id)->where('item_id', $item->id)->where('max_units', '>', 0)->exists());
        }

        $checks[] = $this->check('count', 'Counted: an approved stocktake of it in the store', true, $placeIds->isNotEmpty() && $this->counted($variants->pluck('id')->all(), $placeIds->all()));

        $checks[] = $this->check('individual', 'Individual price', false, StoreVariantIndividualPrice::query()->whereIn('store_variant_id', $rowIds)->where('active', true)->exists());
        $checks[] = $this->check('seller_prices', 'Seller prices', false, StoreVariantSellerPrice::query()->whereIn('store_variant_id', $rowIds)->where('active', true)->exists());
        $checks[] = $this->check('customer_prices', 'Customer prices', false, StoreVariantCustomerPrice::query()->whereIn('store_variant_id', $rowIds)->where('active', true)->exists());
        $checks[] = $this->check('discount', 'A discount running', false, $rows->contains(fn (StoreVariant $r): bool => $this->discounted($r)));
        $checks[] = $this->check('pool', 'Stock kept for business customers', false, $rows->contains(fn (StoreVariant $r): bool => (int) $r->business_pool > 0));
        if ($others->isNotEmpty()) {
            $checks[] = $this->check('levels', 'Levels at the floor or Remote Hub', false,
                ShelfItemBand::query()->whereIn('stock_location_id', $others)->where('item_id', $item->id)->where('max_units', '>', 0)->exists());
        }
        $checks[] = $this->check('route', 'A refill route', false, ItemRefillRoute::query()->where('store_id', $store->id)->where('item_id', $item->id)->exists());

        return ['store' => ['id' => (int) $store->id, 'name' => (string) $store->name]] + $this->part($checks) + ['checks' => $checks];
    }

    /** @param list<array<string, mixed>> $checks */
    private function part(array $checks): array
    {
        return ['percent' => $this->percent($checks), 'checks' => $checks,
            'done_required' => count(array_filter($checks, fn (array $c): bool => $c['required'] && $c['done'])),
            'required' => count(array_filter($checks, fn (array $c): bool => $c['required'])),
            'optional_done' => count(array_filter($checks, fn (array $c): bool => ! $c['required'] && $c['done'])),
            'optional' => count(array_filter($checks, fn (array $c): bool => ! $c['required']))];
    }

    /** done ÷ (required + optional that are done); 0 when there is nothing to judge. */
    public function percent(array $checks): int
    {
        $required = array_filter($checks, fn (array $c): bool => $c['required']);
        $optionalDone = array_filter($checks, fn (array $c): bool => ! $c['required'] && $c['done']);
        $denominator = count($required) + count($optionalDone);
        if ($denominator === 0) {
            return 0;
        }
        $done = count(array_filter($required, fn (array $c): bool => $c['done'])) + count($optionalDone);

        return (int) round(100 * $done / $denominator);
    }

    /** @return array{key: string, label: string, required: bool, done: bool, detail: string} */
    private function check(string $key, string $label, bool $required, bool $done, string $detail = ''): array
    {
        return ['key' => $key, 'label' => $label, 'required' => $required, 'done' => $done, 'detail' => $detail];
    }

    private function countOf(Collection $variants, \Closure $test): string
    {
        return $variants->filter($test)->count().' of '.$variants->count().' variants';
    }

    private function hasPicture(Item $item): bool
    {
        return collect($item->general_images ?? [])->filter(fn ($image): bool => is_string($image) ? trim($image) !== '' : ! empty($image))->isNotEmpty();
    }

    /** The store price on a store variant; a missing or zero price is not a price. */
    private function price(StoreVariant $row): float
    {
        $matrix = (array) $row->pricing_matrix;
        $matrix = isset($matrix[0]) && is_array($matrix[0]) ? $matrix[0] : $matrix;

        return is_numeric($matrix['price'] ?? null) ? (float) $matrix['price'] : 0.0;
    }

    private function discounted(StoreVariant $row): bool
    {
        $matrix = (array) $row->pricing_matrix;
        $matrix = isset($matrix[0]) && is_array($matrix[0]) ? $matrix[0] : $matrix;
        $discount = $matrix['discount_price'] ?? null;
        if (! is_numeric($discount) || (float) $discount <= 0 || (float) $discount >= $this->price($row)) {
            return false;
        }
        $ends = $matrix['discount_ends_at'] ?? null;

        return $ends === null || $ends === '' || now()->startOfDay()->lte(\Illuminate\Support\Carbon::parse((string) $ends)->endOfDay());
    }

    /** @param list<int> $variantIds @param list<int> $placeIds */
    private function counted(array $variantIds, array $placeIds): bool
    {
        return StocktakeLine::query()
            ->whereIn('item_variant_id', $variantIds)
            ->whereNotNull('counted')
            ->whereIn('stocktake_id', Stocktake::query()->where('status', Stocktake::POSTED)->whereIn('stock_location_id', $placeIds)->select('id'))
            ->exists();
    }
}
