<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Read model for the public storefront.
 *
 * Mirrors the seller journey: the grid shows one card per parent Item, and the
 * shopper picks a colour / size / packaging combination on the item's Show
 * page before adding that specific variant to their cart.
 */
class StorefrontCatalogService
{
    /** Location type used by the stock ledger for store-held inventory. */
    private const STORE_LOCATION_TYPE = 'App\Models\Store\Store';

    /**
     * The store the public storefront sells from.
     */
    public function resolveStore(): ?Store
    {
        $configured = config('storefront.store_id');

        if ($configured !== null) {
            $store = Store::find($configured);

            if ($store) {
                return $store;
            }
        }

        return Store::query()
            ->where('status', 'active')
            ->orderBy('id')
            ->first()
            ?? Store::query()->orderBy('id')->first();
    }

    /**
     * Paginated products for the storefront grid — one row per Item.
     *
     * @return LengthAwarePaginator<int, Item>
     */
    public function paginateItems(
        Store $store,
        ?string $search = null,
        ?int $categoryId = null,
        ?int $perPage = null
    ): LengthAwarePaginator {
        return $this->itemQuery($store, $search, $categoryId)
            ->orderBy('product_name')
            ->paginate($perPage ?? (int) config('storefront.per_page', 24))
            ->withQueryString();
    }

    /**
     * Category facets for the navigation bar and pill filters.
     *
     * Counts reflect the sellable catalogue of this store only, so a shopper is
     * never offered a pill that resolves to an empty grid.
     *
     * @return array<int, array{id: int, name: string, count: int}>
     */
    public function categories(Store $store): array
    {
        return $this->itemQuery($store)
            ->with('category')
            ->get()
            ->map(fn (Item $item) => $item->category)
            ->filter()
            ->groupBy('id')
            ->map(fn (Collection $group) => [
                'id' => (int) $group->first()->id,
                'name' => (string) $group->first()->category_name,
                'count' => $group->count(),
            ])
            ->sortBy('name')
            ->values()
            ->all();
    }

    /**
     * Shape an item into a grid card: headline identity, the price it starts
     * from, and how many variants sit behind it.
     *
     * @return array<string, mixed>
     */
    public function presentItemCard(Item $item, Store $store): array
    {
        $options = $this->variantOptions($item, $store);
        $prices = $options->pluck('final_price')->filter(fn ($value) => $value !== null);

        $cheapest = $options
            ->filter(fn (array $option) => $option['final_price'] !== null)
            ->sortBy('final_price')
            ->first();

        $totalStock = (int) $options->sum('available_stock');

        return [
            'id' => (int) $item->id,
            'title' => (string) $item->product_name,
            'description' => $item->description,
            'category' => $item->category ? [
                'id' => (int) $item->category->id,
                'name' => (string) $item->category->category_name,
            ] : null,
            'image_url' => $this->itemImages($item)[0] ?? null,
            'price_from' => $prices->isNotEmpty() ? (float) $prices->min() : null,
            'list_price_from' => $cheapest['price'] ?? null,
            'is_discounted' => (bool) ($cheapest['is_discounted'] ?? false),
            'variant_count' => $options->count(),
            'colors' => $options->pluck('color')->filter()->unique()->values()->all(),
            'sizes' => $options->pluck('size')->filter()->unique()->values()->all(),
            'available_stock' => $totalStock,
            'stock_status' => $this->stockStatus($totalStock),
        ];
    }

    /**
     * Full detail payload for the item Show page: gallery plus every sellable
     * variant, which the page pivots into colour / size / packaging pickers.
     *
     * @return array<string, mixed>
     */
    public function presentItemDetail(Item $item, Store $store): array
    {
        $options = $this->variantOptions($item, $store);
        $images = $this->itemImages($item);

        // Fall back to variant photography when the product itself has none.
        if ($images === []) {
            $images = $options
                ->flatMap(fn (array $option) => $option['images'])
                ->unique()
                ->values()
                ->all();
        }

        $totalStock = (int) $options->sum('available_stock');

        return [
            'id' => (int) $item->id,
            'title' => (string) $item->product_name,
            'description' => $item->description,
            'category' => $item->category ? [
                'id' => (int) $item->category->id,
                'name' => (string) $item->category->category_name,
            ] : null,
            'images' => $images,
            'variants' => $options->values()->all(),
            'available_stock' => $totalStock,
            'stock_status' => $this->stockStatus($totalStock),
        ];
    }

    /**
     * Units of a variant a shopper may still buy from this store.
     *
     * Deliberately expressed in variant units rather than loose pieces: the
     * cart stores unit quantities, so the badge and the cart agree.
     */
    public function availableStock(StoreVariant $storeVariant, Store $store): int
    {
        if ($storeVariant->relationLoaded('stocks')) {
            return (int) $storeVariant->stocks->sum('quantity');
        }

        return (int) $storeVariant->stocks()
            ->where('location_type', self::STORE_LOCATION_TYPE)
            ->where('location_id', $store->id)
            ->sum('quantity');
    }

    /**
     * Retail price ladder for a walk-in shopper.
     *
     * A storefront buyer has no customer record, and PriceProvider treats a
     * null customer as "individual", which is exactly the retail tier.
     *
     * @return array{price: float|null, final_price: float|null, discount_ends_at: string|null, is_discounted: bool}
     */
    public function pricing(StoreVariant $storeVariant, Store $store): array
    {
        $ladder = PriceProvider::getPriceLadder((int) $storeVariant->id, (int) $store->id);

        if (empty($ladder)) {
            return [
                'price' => null,
                'final_price' => null,
                'discount_ends_at' => null,
                'is_discounted' => false,
            ];
        }

        $tier = collect($ladder)->firstWhere('level', 'individual') ?? $ladder[0];

        $price = isset($tier['price']) ? (float) $tier['price'] : null;
        $final = PriceProvider::getFinalPrice($ladder);

        return [
            'price' => $price,
            'final_price' => $final,
            'discount_ends_at' => $tier['discount_ends_at'] ?? null,
            'is_discounted' => $price !== null && $final !== null && $final < $price,
        ];
    }

    /**
     * The price a cart line should be stamped with, in cash terms.
     */
    public function payablePrice(StoreVariant $storeVariant, Store $store): float
    {
        return (float) ($this->pricing($storeVariant, $store)['final_price'] ?? 0.0);
    }

    /**
     * Locate the active store variant row backing an item variant.
     */
    public function storeVariantFor(ItemVariant $variant, Store $store): ?StoreVariant
    {
        return StoreVariant::query()
            ->where('item_variant_id', $variant->id)
            ->where('store_id', $store->id)
            ->where('active', true)
            ->first();
    }

    /**
     * @return 'in_stock'|'low_stock'|'out_of_stock'
     */
    public function stockStatus(int $available): string
    {
        if ($available <= 0) {
            return 'out_of_stock';
        }

        return $available <= (int) config('storefront.low_stock_threshold', 10)
            ? 'low_stock'
            : 'in_stock';
    }

    /**
     * Every sellable variant of an item, shaped for the Show page pickers.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function variantOptions(Item $item, Store $store): Collection
    {
        $item->loadMissing([
            'category',
            'variants.itemColor',
            'variants.itemSize',
            'variants.itemPackagingType',
            'variants.packagingQuantities',
            'variants.storeVariants' => fn ($query) => $query
                ->where('store_id', $store->id)
                ->where('active', true)
                ->with([
                    'stocks' => fn ($stockQuery) => $stockQuery
                        ->where('location_type', self::STORE_LOCATION_TYPE)
                        ->where('location_id', $store->id),
                ]),
        ]);

        return $item->variants
            ->map(function (ItemVariant $variant) use ($store) {
                $storeVariant = $variant->storeVariants->firstWhere('store_id', $store->id);

                if (! $storeVariant) {
                    return null;
                }

                $pricing = $this->pricing($storeVariant, $store);
                $stock = $this->availableStock($storeVariant, $store);
                $images = $this->resolveKeys($variant->images ?? []);

                return [
                    'id' => (int) $variant->id,
                    'store_variant_id' => (int) $storeVariant->id,
                    'sku' => $variant->sku,
                    'barcode' => $variant->barcode,
                    'color' => $variant->itemColor?->name,
                    'size' => $variant->itemSize?->name,
                    'packaging' => $variant->itemPackagingType?->name,
                    'pieces_per_unit' => $variant->calculateTotalPieces(),
                    'image_url' => $images[0] ?? null,
                    'images' => $images,
                    'price' => $pricing['price'],
                    'final_price' => $pricing['final_price'],
                    'discount_ends_at' => $pricing['discount_ends_at'],
                    'is_discounted' => $pricing['is_discounted'],
                    'available_stock' => $stock,
                    'stock_status' => $this->stockStatus($stock),
                ];
            })
            ->filter()
            ->values();
    }

    /**
     * Sellable catalogue for a store, optionally narrowed by the search box
     * and category pills. An item qualifies once it has at least one active
     * store variant here.
     *
     * @return Builder<Item>
     */
    private function itemQuery(Store $store, ?string $search = null, ?int $categoryId = null): Builder
    {
        $query = Item::query()
            ->where('status', 'active')
            ->whereHas(
                'variants.storeVariants',
                fn (Builder $q) => $q
                    ->where('store_id', $store->id)
                    ->where('active', true)
            );

        if ($categoryId !== null) {
            $query->where('item_category_id', $categoryId);
        }

        if ($search !== null && $search !== '') {
            $term = '%' . $search . '%';

            $query->where(function (Builder $q) use ($term): void {
                $q->where('product_name', 'LIKE', $term)
                    ->orWhereHas('variants', fn (Builder $vq) => $vq
                        ->where('sku', 'LIKE', $term)
                        ->orWhere('barcode', 'LIKE', $term));
            });
        }

        return $query;
    }

    /**
     * Product-level photography, falling back to variant imagery so a card is
     * never blank when only the SKUs have photos.
     *
     * @return array<int, string>
     */
    private function itemImages(Item $item): array
    {
        $images = $this->resolveKeys($item->general_images ?? []);

        if ($images !== []) {
            return $images;
        }

        return $item->variants
            ->flatMap(fn (ItemVariant $variant) => $this->resolveKeys($variant->images ?? []))
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  iterable<mixed>  $keys
     * @return array<int, string>
     */
    private function resolveKeys(iterable $keys): array
    {
        return collect($keys)
            ->filter()
            ->map(fn ($key) => ImageResolver::resolve((string) $key))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }
}
