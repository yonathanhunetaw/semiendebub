<?php

declare(strict_types=1);

namespace App\Services\Seller;

use App\Models\Item\Item;
use App\Models\Auth\User;
use App\Models\Item\ItemCategory;
use App\Models\Seller\Cart;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\ItemStock;
use App\Services\ImageResolver;
use App\Services\Inventory\PackagingLadder;
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
    /** @var array<int, array{shelf: array<int>, floor: array<int>, remote: ?int}> */
    private array $leaves = [];

    public function __construct(
        private readonly StockScope $stockScope,
        private readonly PackagingLadder $ladder,
    ) {
    }

    /**
     * The places a seller's figures come from: the Store Shelf and the Store
     * Floor, which they can sell from, and the store's Remote Hub, which they
     * can only ask a transfer from (so they are told it is there, not how much).
     *
     * @return array{shelf: array<int>, floor: array<int>, remote: ?int}
     */
    public function storeLeaves(int $storeId): array
    {
        if (isset($this->leaves[$storeId])) {
            return $this->leaves[$storeId];
        }

        $rows = StockLocation::query()
            ->where('store_id', $storeId)
            ->whereIn('kind', [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM, StockLocation::KIND_REMOTE_HUB])
            ->get(['id', 'kind']);

        return $this->leaves[$storeId] = [
            'shelf' => $rows->where('kind', StockLocation::KIND_SHELF)->pluck('id')->map(fn ($id): int => (int) $id)->values()->all(),
            'floor' => $rows->where('kind', StockLocation::KIND_BACKROOM)->pluck('id')->map(fn ($id): int => (int) $id)->values()->all(),
            'remote' => ($id = $rows->firstWhere('kind', StockLocation::KIND_REMOTE_HUB)?->id) === null ? null : (int) $id,
        ];
    }

    /** Whether any of these variants has stock in the store's Remote Hub. */
    public function inRemoteHub(int $storeId, array $variantIds): bool
    {
        $remote = $this->storeLeaves($storeId)['remote'];

        return $remote !== null && $variantIds !== [] && ItemStock::query()
            ->where('stock_location_id', $remote)
            ->whereIn('item_variant_id', $variantIds)
            ->where('quantity', '>', 0)
            ->exists();
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
                'category.parent',
                'variants' => function ($q) use ($storeId, $leafIds) {
                    $q->with([
                        'itemColor',
                        'itemSize',
                        'itemPackagingType',
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
     * The cart prices are quoted for, and what it means for VAT. That is the
     * requested cart when the seller can see it and it is still open,
     * otherwise their highest-priority open cart. A cart with no customer
     * (walk-in) or a customer with a TIN prices as individual, so its cards
     * show VAT-inclusive prices (the rule CheckoutService charges by).
     *
     * @return array{cart: ?Cart, customer: mixed, has_tin_cart: bool, top_cart_is_individual: bool}
     */
    public function cartContext(User $seller, ?int $cartId = null): array
    {
        $open = Cart::with('customer')->visibleTo($seller)->where('status', 'open');

        $cart = ($cartId ? (clone $open)->find($cartId) : null)
            ?? (clone $open)->where('seller_id', $seller->id)->orderBy('priority')->first();

        $individual = $cart !== null && ($cart->customer_id === null || ! empty($cart->customer?->tin_number));

        return [
            'cart' => $cart,
            'customer' => $cart?->customer,
            'has_tin_cart' => $individual,
            'top_cart_is_individual' => $individual,
        ];
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
     * this seller (and customer, when a cart is open), what variants it comes in,
     * and its Store Shelf and Store Floor stock (Remote Hub only as a yes/no).
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

        // Pieces on the Store Shelf and the Store Floor, kept apart because
        // they are spoken differently (shelf in the smallest unit, floor
        // biggest unit first). Only variants the store sells are counted.
        $leaves = $this->storeLeaves($storeId);
        $shelfPieces = 0;
        $floorPieces = 0;
        $carried = collect();
        foreach ($item->variants as $variant) {
            $storeVariants = $variant->storeVariants->where('store_id', $storeId)->where('active', true);
            if ($storeVariants->isEmpty()) {
                continue;
            }
            $carried->push($variant);
            $pieces = max(1, $variant->calculateTotalPieces());
            foreach ($storeVariants as $sv) {
                foreach ($sv->stocks as $stock) {
                    $quantity = (int) $stock->quantity * $pieces;
                    if (in_array((int) $stock->stock_location_id, $leaves['shelf'], true)) {
                        $shelfPieces += $quantity;
                    } elseif (in_array((int) $stock->stock_location_id, $leaves['floor'], true)) {
                        $floorPieces += $quantity;
                    }
                }
            }
        }

        $names = fn (string $relation) => $carried
            ->map(fn ($variant) => $variant->{$relation}?->name)
            ->filter()
            ->unique()
            ->values()
            ->all();

        return [
            'id' => $item->id,
            'product_name' => $item->product_name,
            'sold_count' => $item->sold_count ?? 0,
            'category' => $item->category ? [
                'category_name' => $item->category->category_name,
                'parent_name' => $item->category->parent?->category_name,
            ] : null,
            // What the item comes in, for cards with no photo to show it.
            'variant_summary' => [
                'count' => $carried->count(),
                'colors' => $names('itemColor'),
                'sizes' => $names('itemSize'),
                'packaging' => $names('itemPackagingType'),
            ],
            'image_urls' => $imageUrls,
            'original_price' => $priceInfo['store_price'],
            'store_price' => $priceInfo['store_price'],
            'final_price' => $priceInfo['final_price'],
            'discount_ends_at' => $priceInfo['discount_ends_at'],
            'pricing_matrix' => $priceInfo['pricing_matrix'],
            'individual_price' => collect($priceInfo['pricing_matrix'])->firstWhere('level', 'individual'),
            // Pieces the seller can sell from: Store Shelf + Store Floor.
            'store_stock' => $shelfPieces + $floorPieces,
            'stock' => [
                'shelf' => $this->ladder->present($shelfPieces, (int) $item->id, PackagingLadder::DISPLAY_SMALLEST),
                'floor' => $this->ladder->present($floorPieces, (int) $item->id, PackagingLadder::DISPLAY_BREAKDOWN),
                // Reaching it means a transfer, so only whether it is there.
                'in_remote_hub' => $this->inRemoteHub($storeId, $carried->pluck('id')->map(fn ($id): int => (int) $id)->all()),
            ],
        ];
    }

    private function resolveImageUrl(?string $path): ?string
    {
        return empty($path) ? null : ImageResolver::resolve($path);
    }
}
