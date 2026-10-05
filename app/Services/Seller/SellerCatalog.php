<?php

declare(strict_types=1);

namespace App\Services\Seller;

use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Services\ImageResolver;
use App\Services\Inventory\StockScope;
use App\Services\PriceProvider;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * The seller's catalogue: active items this store carries, shaped as the
 * cards the Store page (dashboard), the item index and the category pages
 * show. DashboardController and ItemController each had an identical copy of
 * this; it lives here so every catalogue card prices and counts stock the
 * same way.
 */
class SellerCatalog
{
    public function __construct(private readonly StockScope $stockScope)
    {
    }

    /**
     * Active items with at least one active store variant at $storeId, with the
     * relations present() reads already loaded.
     *
     * @return Builder<Item>
     */
    public function query(int $storeId): Builder
    {
        // Shelf + floor (STOCK_PLAN.md phase 4).
        $leafIds = $this->stockScope->storeLeafIds($storeId);

        return Item::where('items.status', 'active')
            ->with([
                'category',
                'variants' => function ($q) use ($storeId, $leafIds) {
                    $q->with([
                        'storeVariants' => function ($sq) use ($storeId, $leafIds) {
                            $sq->where('store_id', $storeId)
                                ->where('active', true)
                                ->with(['stocks' => fn ($stockQuery) => $stockQuery->whereIn('stock_location_id', $leafIds)]);
                        },
                    ]);
                },
            ])
            ->whereHas('variants.storeVariants', function ($q) use ($storeId) {
                $q->where('store_id', $storeId)->where('active', true);
            });
    }

    /**
     * Categories that hold at least one item this store carries, for the
     * Store page's filter pills.
     *
     * @return list<array{id: int, name: string}>
     */
    public function categories(int $storeId): array
    {
        $ids = $this->query($storeId)
            ->setEagerLoads([])
            ->whereNotNull('item_category_id')
            ->distinct()
            ->pluck('item_category_id');

        return ItemCategory::whereIn('id', $ids)
            ->orderBy('category_name')
            ->get(['id', 'category_name'])
            ->map(fn (ItemCategory $c) => ['id' => (int) $c->id, 'name' => (string) $c->category_name])
            ->values()
            ->all();
    }

    /**
     * The item in $categoryIds that sold the most units at this store, as a
     * card with `units_sold`, or null when nothing there has sold yet.
     * Canceled and refunded sales don't count.
     *
     * @param  iterable<int>  $categoryIds
     * @return array<string, mixed>|null
     */
    public function bestSeller(int $storeId, iterable $categoryIds): ?array
    {
        $unitsPerItem = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('store_variants', 'store_variants.id', '=', 'sale_items.store_variant_id')
            ->join('item_variants', 'item_variants.id', '=', 'store_variants.item_variant_id')
            ->where('store_variants.store_id', $storeId)
            ->whereNotIn('sales.status', ['canceled', 'refunded'])
            ->groupBy('item_variants.item_id')
            ->selectRaw('item_variants.item_id, SUM(sale_items.quantity) AS units_sold');

        $item = $this->query($storeId)
            ->whereIn('items.item_category_id', collect($categoryIds)->all())
            ->joinSub($unitsPerItem, 'sold', 'sold.item_id', '=', 'items.id')
            ->select('items.*', 'sold.units_sold')
            ->orderByDesc('sold.units_sold')
            ->orderBy('items.product_name')
            ->first();

        return $item ? [...$this->present($item, $storeId), 'units_sold' => (int) $item->units_sold] : null;
    }

    /**
     * One catalogue card: images, the price tiers PriceProvider resolves for
     * this seller (and customer, when a cart is open), and store stock in pieces.
     *
     * @return array<string, mixed>
     */
    public function present(Item $item, int $storeId, $customer = null): array
    {
        $generalImages = is_string($item->general_images) ? json_decode($item->general_images, true) : ($item->general_images ?? []);

        $variantImages = collect();
        foreach ($item->variants as $variant) {
            $raw = is_string($variant->images) ? json_decode($variant->images, true) : ($variant->images ?? []);
            foreach ((array) $raw as $img) {
                if (! empty($img)) {
                    $variantImages->push($this->resolveImageUrl($img));
                }
            }
        }

        $imageUrls = collect((array) $generalImages)
            ->map(fn ($path) => $this->resolveImageUrl($path))
            ->merge($variantImages)
            ->filter()
            ->unique()
            ->values()
            ->toArray();

        $priceInfo = PriceProvider::getItemPriceRange($item, $storeId, Auth::id(), $customer);

        $totalStock = 0;
        foreach ($item->variants as $variant) {
            foreach ($variant->storeVariants->where('store_id', $storeId) as $sv) {
                if (! $sv->active) {
                    continue;
                }
                $pieces = $variant->calculateTotalPieces();
                $multiplier = $pieces > 0 ? $pieces : 1;
                $totalStock += ((int) $sv->stocks->sum('quantity')) * $multiplier;
            }
        }

        return [
            'id' => $item->id,
            'product_name' => $item->product_name,
            'sold_count' => $item->sold_count ?? 0,
            'category' => $item->category ? ['category_name' => $item->category->category_name] : null,
            'image_urls' => $imageUrls,
            'original_price' => $priceInfo['store_price'],
            'store_price' => $priceInfo['store_price'],
            'final_price' => $priceInfo['final_price'],
            'discount_ends_at' => $priceInfo['discount_ends_at'],
            'pricing_matrix' => $priceInfo['pricing_matrix'],
            'individual_price' => collect($priceInfo['pricing_matrix'])->firstWhere('level', 'individual'),
            'store_stock' => $totalStock,
        ];
    }

    private function resolveImageUrl(?string $path): ?string
    {
        return empty($path) ? null : ImageResolver::resolve($path);
    }
}
