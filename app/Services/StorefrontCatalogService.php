<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator as Paginator;
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

    /** Orderings the storefront offers. */
    public const SORT_NAME = 'name';

    public const SORT_NEWEST = 'newest';

    public const SORT_PRICE_ASC = 'price_asc';

    public const SORT_PRICE_DESC = 'price_desc';

    /** @var array<int, string> */
    public const SORTS = [
        self::SORT_NAME,
        self::SORT_NEWEST,
        self::SORT_PRICE_ASC,
        self::SORT_PRICE_DESC,
    ];

    /**
     * Paginated products for the storefront grid — one row per Item.
     *
     * Two paths, because price is not a column. Name and newest order in SQL
     * and paginate normally. Price ordering and the on-sale filter need the
     * retail ladder resolved through PriceProvider, which means walking the
     * store's whole sellable catalogue — so that path is taken only when the
     * shopper actually asks for it, and never on the default page load.
     *
     * @param  array{search?: string|null, category_id?: int|null, sort?: string|null, in_stock?: bool, on_sale?: bool}  $filters
     * @return LengthAwarePaginator<int, Item>
     */
    public function paginateItems(
        Store $store,
        ?string $search = null,
        ?int $categoryId = null,
        ?int $perPage = null,
        array $filters = []
    ): LengthAwarePaginator {
        $perPage = $perPage ?? (int) config('storefront.per_page', 24);
        $sort = in_array($filters['sort'] ?? null, self::SORTS, true)
            ? (string) $filters['sort']
            : self::SORT_NAME;
        $onSale = (bool) ($filters['on_sale'] ?? false);
        $inStock = (bool) ($filters['in_stock'] ?? false);

        $query = $this->itemQuery($store, $search, $categoryId);

        if ($inStock) {
            $this->constrainToStocked($query, $store);
        }

        $needsLadder = $onSale
            || $sort === self::SORT_PRICE_ASC
            || $sort === self::SORT_PRICE_DESC;

        if (! $needsLadder) {
            return $this->withCatalogueRelations($query, $store)
                ->when($sort === self::SORT_NEWEST, fn (Builder $q) => $q
                    ->orderByDesc('created_at')
                    ->orderByDesc('id'))
                ->when($sort === self::SORT_NAME, fn (Builder $q) => $q->orderBy('product_name'))
                ->paginate($perPage)
                ->withQueryString();
        }

        return $this->paginateByLadder($query, $store, $sort, $onSale, $perPage);
    }

    /**
     * Order and filter on the resolved retail ladder, then paginate by hand.
     *
     * @param  Builder<Item>  $query
     * @return LengthAwarePaginator<int, Item>
     */
    private function paginateByLadder(
        Builder $query,
        Store $store,
        string $sort,
        bool $onSaleOnly,
        int $perPage
    ): LengthAwarePaginator {
        // One pass with the relations eager loaded, so variantOptions() finds
        // everything already in memory instead of firing a query per item.
        $resolved = $this->withCatalogueRelations($query, $store)
            ->orderBy('product_name')
            ->get()
            ->map(function (Item $item) use ($store) {
                $options = $this->variantOptions($item, $store);
                $prices = $options
                    ->pluck('final_price')
                    ->filter(fn ($value) => $value !== null);

                return [
                    'item' => $item,
                    'price' => $prices->isNotEmpty() ? (float) $prices->min() : null,
                    'on_sale' => $options->contains(fn (array $o) => (bool) $o['is_discounted']),
                ];
            });

        if ($onSaleOnly) {
            $resolved = $resolved->filter(fn (array $row) => $row['on_sale']);
        }

        // Items with no resolvable price sort last either way — an unpriced card
        // is the least useful thing to put at the top of a price listing.
        $sorted = $resolved
            ->sortBy(
                fn (array $row) => $row['price'] ?? PHP_INT_MAX,
                SORT_REGULAR,
                $sort === self::SORT_PRICE_DESC,
            )
            ->values();

        $page = max(1, (int) request()->integer('page', 1));

        return new Paginator(
            $sorted->forPage($page, $perPage)->pluck('item')->values()->all(),
            $sorted->count(),
            $perPage,
            $page,
            ['path' => request()->url(), 'query' => request()->query()],
        );
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
            // Packaging of the cheapest sellable variant. The card uses it to
            // draw a packaging-shaped placeholder when there is no photograph,
            // which is most of the catalogue — a grid of identical grey "no
            // image" tiles tells a shopper nothing about what they are buying.
            'packaging_from' => $cheapest['packaging'] ?? $options->first()['packaging'] ?? null,
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
     * Eager load everything a card or a price resolution needs.
     *
     * variantOptions() calls loadMissing() per item, which is a query per card
     * — twenty-four round trips to paint one page of the grid, and one per item
     * in the catalogue when resolving prices. Loading the same relations up
     * front makes those loadMissing() calls no-ops.
     *
     * The constraints have to match variantOptions() exactly, or loadMissing()
     * decides the relation is absent and queries again.
     *
     * @param  Builder<Item>  $query
     * @return Builder<Item>
     */
    private function withCatalogueRelations(Builder $query, Store $store): Builder
    {
        return $query->with([
            'category',
            'variants.itemColor',
            'variants.itemSize',
            'variants.itemPackagingType',
            'variants.packagingQuantities',
            'variants.storeVariants' => fn ($q) => $q
                ->where('store_id', $store->id)
                ->where('active', true)
                ->with([
                    'stocks' => fn ($stockQuery) => $stockQuery
                        ->where('location_type', self::STORE_LOCATION_TYPE)
                        ->where('location_id', $store->id),
                ]),
        ]);
    }

    /**
     * Narrow to items this store can actually ship today.
     *
     * Expressed in SQL rather than by resolving each card, so the cheap filter
     * stays cheap: the ledger row has to exist, be at this store, and carry
     * something.
     *
     * @param  Builder<Item>  $query
     */
    private function constrainToStocked(Builder $query, Store $store): void
    {
        $query->whereHas('variants', fn (Builder $variantQuery) => $variantQuery
            ->whereHas('storeVariants', fn (Builder $sv) => $sv
                ->where('store_id', $store->id)
                ->where('active', true))
            ->whereHas('stocks', fn (Builder $stock) => $stock
                ->where('location_type', self::STORE_LOCATION_TYPE)
                ->where('location_id', $store->id)
                ->where('quantity', '>', 0)));
    }

    /**
     * Other products from the same shelf, for the foot of a product page.
     *
     * Same category and same store, because a suggestion a shopper cannot buy
     * here is worse than no suggestion. Falls back to the rest of the store's
     * catalogue when the category has nothing else in it, so the rail is not
     * empty on a one-product category.
     *
     * @return array<int, array<string, mixed>>
     */
    public function relatedItems(Item $item, Store $store, int $limit = 6): array
    {
        $sameCategory = $item->item_category_id !== null
            ? $this->withCatalogueRelations(
                $this->itemQuery($store, null, (int) $item->item_category_id),
                $store
            )
                ->whereKeyNot($item->id)
                ->orderBy('product_name')
                ->limit($limit)
                ->get()
            : collect();

        if ($sameCategory->count() < $limit) {
            $filler = $this->withCatalogueRelations($this->itemQuery($store), $store)
                ->whereKeyNot($item->id)
                ->whereNotIn('id', $sameCategory->modelKeys())
                ->orderBy('product_name')
                ->limit($limit - $sameCategory->count())
                ->get();

            $sameCategory = $sameCategory->concat($filler);
        }

        return $sameCategory
            ->map(fn (Item $related) => $this->presentItemCard($related, $store))
            ->values()
            ->all();
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
