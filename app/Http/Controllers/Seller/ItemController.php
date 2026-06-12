<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Seller\Cart;
use App\Services\PriceProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;
use Inertia\Inertia;

class ItemController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $user = Auth::user();
        $storeId = $user->store?->id;
        $search = $request->filled('search') ? trim($request->search) : null;
        $cartId = $request->integer('cart_id') ?: null;

        // 🪵 LOG 1: Track incoming request context
        Log::info("Fetching items index page", [
            'user_id' => $user->id,
            'store_id' => $storeId,
            'search' => $search,
            'cart_id' => $cartId,
        ]);
        
        if (!$storeId) {
            return Inertia::render('Seller/Items/Index', [
                'items' => [],
                'nextPageUrl' => null,
                'filters' => ['search' => $search, 'cart_id' => $cartId],
            ]);
        }

        $query = Item::where('status', 'active')
            ->with([
                'category',
                'variants' => function ($q) use ($storeId) {
                    $q->with([
                        'storeVariants' => function ($sq) use ($storeId) {
                            $sq->where('store_id', $storeId)
                                ->with([
                                    'stocks' => function ($stockQuery) use ($storeId) {
                                        $stockQuery->where('location_type', 'App\Models\Store\Store')
                                            ->where('location_id', $storeId);
                                    }
                                ]);
                        }
                    ]);
                },
            ]);

        $query->whereHas('variants.storeVariants', function ($q) use ($storeId) {
            $q->where('store_id', $storeId);
        });

        if ($search) {
            $query->where('product_name', 'LIKE', '%' . $search . '%');
        }

        $startTime = microtime(true);
        $perPage = 20;
        $paginator = $query->orderBy('product_name')->paginate($perPage);
        $executionTime = round((microtime(true) - $startTime) * 1000, 2);

        $items = collect($paginator->items())->map(function ($item) use ($storeId) {
            return $this->enrichItemForIndex($item, $storeId);
        });

        Log::info("Items index (paginated)", [
            'store_id' => $storeId,
            'page' => $paginator->currentPage(),
            'per_page' => $perPage,
            'total' => $paginator->total(),
            'execution_ms' => $executionTime,
        ]);

        return Inertia::render('Seller/Items/Index', [
            'items' => $items,
            'nextPageUrl' => $paginator->nextPageUrl(),
            'filters' => [
                'search' => $search ?? '',
                'cart_id' => $cartId,
            ],
        ]);
    }

    private function enrichItemForIndex(Item $item, int $storeId): array
    {
        $bestPrice = null;
        $bestDiscountPrice = null;
        $bestDiscountEndsAt = null;
        $totalStock = 0;

        $generalImages = $item->general_images ?? [];
        if (is_string($generalImages)) {
            $decoded = json_decode($generalImages, true);
            $generalImages = is_array($decoded) ? $decoded : [];
        }

        $variantImages = collect();
        foreach ($item->variants as $variant) {
            $raw = $variant->images ?? [];
            if (is_string($raw)) {
                $decoded = json_decode($raw, true);
                $raw = is_array($decoded) ? $decoded : [];
            }
            foreach ($raw as $img) {
                if (!empty($img)) {
                    $variantImages->push($this->resolveImageUrl($img));
                }
            }

            foreach ($variant->storeVariants as $storeVariant) {
                foreach ($storeVariant->stocks as $stock) {
                    $totalStock += (int) $stock->quantity;
                }

                $basePrice = (float) ($storeVariant->price ?? 0);
                $discountPrice = $storeVariant->discount_price ? (float) $storeVariant->discount_price : null;
                $discountEndsAt = $storeVariant->discount_ends_at;

                $isDiscountActive = $discountPrice !== null
                    && $discountPrice > 0
                    && $discountPrice < $basePrice
                    && ($discountEndsAt === null || Carbon::now()->lt(Carbon::parse($discountEndsAt)));

                $finalPrice = $isDiscountActive ? $discountPrice : $basePrice;

                if ($bestPrice === null || $finalPrice < $bestPrice) {
                    $bestPrice = $finalPrice;
                    $bestDiscountPrice = $isDiscountActive ? $discountPrice : null;
                    $bestDiscountEndsAt = $isDiscountActive ? $discountEndsAt : null;
                }
            }
        }

        $originalPrice = $bestPrice ?? 0;
        $finalPrice = ($bestDiscountPrice !== null && $bestDiscountPrice < $originalPrice)
            ? $bestDiscountPrice
            : $originalPrice;

        $imageUrls = collect($generalImages)
            ->map(fn($path) => $this->resolveImageUrl($path))
            ->merge($variantImages)
            ->filter()
            ->unique()
            ->values()
            ->toArray();

        return [
            'id' => $item->id,
            'product_name' => $item->product_name,
            'sold_count' => $item->sold_count ?? 0,
            'category' => $item->category ? ['category_name' => $item->category->category_name] : null,
            'image_urls' => $imageUrls,
            'original_price' => $originalPrice,
            'final_price' => $finalPrice,
            'discount_ends_at' => $bestDiscountEndsAt,
            'store_stock' => $totalStock,
            'pricing_matrix' => [
                'price' => $originalPrice,
                'discount_price' => $bestDiscountPrice,
                'discount_ends_at' => $bestDiscountEndsAt,
            ],
        ];
    }

    private function resolveImageUrl(?string $path): ?string
    {
        if (empty($path))
            return null;
        if (str_starts_with($path, 'http'))
            return $path;

        $baseUrl = config('filesystems.disks.s3.url') ?? env('AWS_URL', 'http://duka.test:9000/duka-images');
        return $baseUrl . '/' . ltrim($path, '/');
    }

    public function search(Request $request)
    {
        $query = $request->input('search');
        $storeId = Auth::user()->store?->id;
        $page = $request->integer('page', 1);
        $perPage = 20;

        if (!$storeId) {
            return redirect()->route('seller.items.index');
        }

        $selectedCategoryId = $request->input('category_id');

        $queryBuilder = Item::where('status', 'active')
            ->whereHas('variants.storeVariants', fn($q) => $q->where('store_id', $storeId))
            ->with([
                'category',
                'variants' => function ($q) use ($storeId) {
                    $q->with([
                        'storeVariants' => function ($sq) use ($storeId) {
                            $sq->where('store_id', $storeId)
                                ->with([
                                    'stocks' => function ($stockQuery) use ($storeId) {
                                        $stockQuery->where('location_type', 'App\Models\Store\Store')
                                            ->where('location_id', $storeId);
                                    }
                                ]);
                        }
                    ]);
                },
            ]);

        if ($query) {
            $queryBuilder->where('product_name', 'LIKE', "%{$query}%");
        }

        if ($selectedCategoryId) {
            $queryBuilder->where('item_category_id', $selectedCategoryId);
        }

        $paginator = $queryBuilder->orderBy('product_name')
            ->paginate($perPage, ['*'], 'page', $page);

        $itemsCollection = collect($paginator->items());

        // 2️⃣ Load stock levels
        $storeVariantIds = $itemsCollection->flatMap(fn($item) => $item->variants->pluck('storeVariants.*.id'))
            ->flatten()
            ->unique();

        $stocks = \App\Models\StockKeeper\ItemStock::where('location_id', $storeId)
            ->where('location_type', 'App\Models\Store\Store')
            ->whereIn('item_variant_id', $storeVariantIds)
            ->get()
            ->keyBy('item_variant_id');

        $sellerId = Auth::user()->id;
        $customerId = $request->input('customer_id');
        if ($customerId === 'null' || $customerId === 'undefined' || !$customerId) {
            $customerId = null;
        }

        $items = $itemsCollection->map(function ($item) use ($storeId, $sellerId, $customerId, $stocks) {
            // Process images
            $generalImages = $item->general_images ?? [];
            if (is_string($generalImages)) {
                $generalImages = json_decode($generalImages, true) ?: [];
            }
            $item->image_urls = collect($generalImages)
                ->map(fn($path) => $this->resolveImageUrl($path))
                ->merge($item->variants->map(fn($v) => $this->resolveImageUrl($v->images[0] ?? null)))
                ->filter()
                ->unique()
                ->values()
                ->toArray();

            $variantPrices = [];
            $totalStock = 0;

            // Process each variant
            foreach ($item->variants as $variant) {
                $storeVariant = $variant->storeVariants->where('store_id', $storeId)->first();

                if ($storeVariant) {
                    $stockQty = $stocks[$storeVariant->id]->quantity ?? 0;
                    $totalStock += $stockQty;
                    $variant->store_stock = $stockQty;

                    $matrix = $storeVariant->pricing_matrix;
                    if (is_string($matrix)) {
                        $matrix = json_decode($matrix, true);
                    }
                    $variant->pricing_matrix = $matrix;

                    $variant->price_ladder = PriceProvider::getPriceLadder(
                        storeVariantId: $storeVariant->id,
                        storeId: $storeId,
                        sellerId: $sellerId,
                        customerId: $customerId
                    );

                    $variant->final_price = PriceProvider::getFinalPrice($variant->price_ladder);

                    $basePriceLevel = $variant->price_ladder[0] ?? null;
                    $variant->store_price = $basePriceLevel['price'] ?? 0;
                    $variant->store_discount_price = $basePriceLevel['discount_price'] ?? null;
                    $variant->discount_ends_at = $basePriceLevel['discount_ends_at'] ?? null;

                    if (!$variant->store_price) {
                        $variant->store_price = $matrix['price'] ?? 0;
                    }
                    if (!$variant->store_discount_price) {
                        $variant->store_discount_price = $matrix['discount_price'] ?? null;
                    }
                    if (!$variant->discount_ends_at) {
                        $variant->discount_ends_at = $matrix['discount_ends_at'] ?? null;
                    }

                    $variantPrices[] = $variant->final_price;
                }
            }

            $item->store_price = !empty($variantPrices) ? min($variantPrices) : null;
            $item->store_stock = $totalStock;

            $firstVariant = $item->variants->first();
            if ($firstVariant) {
                $item->discount_ends_at = $firstVariant->discount_ends_at;
                $item->pricing_matrix = $firstVariant->pricing_matrix;
                $item->original_price = $firstVariant->store_price;
            }

            $item->original_price = $item->store_price ?? 0;
            $item->final_price = !empty($variantPrices) ? min($variantPrices) : null;

            return [
                'id' => $item->id,
                'product_name' => $item->product_name,
                'sold_count' => $item->sold_count ?? 0,
                'category' => $item->category ? ['category_name' => $item->category->category_name] : null,
                'image_urls' => $item->image_urls,
                'original_price' => $item->original_price,
                'final_price' => $item->final_price,
                'discount_ends_at' => $item->discount_ends_at,
                'store_stock' => $item->store_stock,
                'pricing_matrix' => $item->pricing_matrix,
            ];
        });

        // Get categories of items matching search query or matching active items
        $categoryQuery = Item::where('status', 'active')
            ->whereHas('variants.storeVariants', fn($q) => $q->where('store_id', $storeId))
            ->whereNotNull('item_category_id');

        if ($query) {
            $categoryQuery->where('product_name', 'LIKE', "%{$query}%");
        }

        $categoryIds = $categoryQuery->distinct()->pluck('item_category_id');

        $categories = \App\Models\Item\ItemCategory::whereIn('id', $categoryIds)
            ->select('id', 'category_name')
            ->orderBy('category_name')
            ->get();

        return Inertia::render('Seller/Items/SearchResults', [
            'query' => $query ?? '',
            'items' => $items,
            'nextPageUrl' => $paginator->nextPageUrl(),
            'categories' => $categories,
            'selectedCategoryId' => $selectedCategoryId ? (int) $selectedCategoryId : null,
        ]);
    }


    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        //
    }

    /**
     * Display the specified resource.
     */

    public function show(Item $item)
    {
        $store = Auth::user()->store;
        $storeId = $store?->id;

        $sellerId = request('seller_id');
        $customerId = request('customer_id');
        $selectedCartId = request('cart_id');

        // Load variants with all needed relations
        $item->load([
            'variants.itemColor',
            'variants.itemSize',
            'variants.itemPackagingType',
            'variants.packagingQuantities',
            'variants.storeVariants.sellerPrices',
            'variants.storeVariants.customerPrices',
            'variants.storeVariants.stocks',
            // 'variants.storeVariants.sellerPrices',
            'variants.owner',
        ]);

        $storeVariants = $item->variants->flatMap(fn($v) => $v->storeVariants);

        $minStoreVariant = $storeVariants
            ->filter(fn($sv) => $sv->computed_status === 'active')
            ->sortBy(fn($sv) => $sv->discount_price ?? $sv->price)
            ->first();

        // 🔹 Build item images
        // 🔹 1. Process General Item Images (Priority)
        $itemImages = collect();
        $rawImages = $item->general_images;
        if (!empty($rawImages)) {
            $imagesArray = is_array($rawImages) ? $rawImages : (json_decode($rawImages, true) ?: []);
            if (is_array($imagesArray)) {
                $itemImages = collect($imagesArray)
                    ->filter(fn($img) => !empty($img))
                    ->map(fn($img) => $this->resolveImageUrl($img));
            }
        }

        // 🔹 2. Process all Variant Images
        $variantImagesCollection = $item->variants->flatMap(function ($v) {
            $raw = is_string($v->images) ? json_decode($v->images, true) : ($v->images ?? []);
            return collect(is_array($raw) ? $raw : [])
                ->filter(fn($img) => !empty($img))
                ->map(fn($img) => $this->resolveImageUrl($img));
        });

        // 🔹 3. Merge: General first, then unique Variant images
        $allImages = $itemImages
            ->merge($variantImagesCollection)
            ->filter(fn($img) => !empty($img))
            ->unique()
            ->values();
        // 🚀 LOG 1: Main Gallery Images
        Log::info('INERTIA_DEBUG: Main Gallery (allImages)', [
            'item_id' => $item->id,
            'count' => $allImages->count(),
            'urls' => $allImages->toArray(),
        ]);

        // 🔹 Build enriched variant data
        $variantData = $item->variants->map(function ($variant) use ($storeId, $sellerId, $customerId) {
            // Get the store variant for the current store
            $storeVariant = $variant->storeVariants->where('store_id', $storeId)->first();
            if (app()->environment('testing') && is_null($storeVariant)) {
                // This will stop the test and show you the IDs
                dd([
                    'looking_for_store_id' => $storeId,
                    'available_store_variants' => $variant->storeVariants->toArray()
                ]);
            }

            // 🛑 FIX: Get stock from the item_stocks relationship, not the store_variants column
            // We filter by location_id to make sure we don't show stock from other stores
            $stockRecord = $storeVariant?->stocks
                ->where('location_id', $storeId)
                ->where('location_type', 'App\Models\Store\Store')
                ->first();

            $store_stock = $stockRecord?->quantity ?? 0;

            $price = $storeVariant?->price;
            $discount_price = $storeVariant?->discount_price;
            $status = $storeVariant?->computed_status ?? 'inactive';
            $store_active = $status === 'active';

            // Price ladder via Service Provider
            $price_ladder = $storeVariant
                ? PriceProvider::getPriceLadder(
                    storeVariantId: $storeVariant->id,
                    storeId: $storeId,
                    sellerId: $sellerId,
                    customerId: $customerId
                )
                : [];
            $final_price = $storeVariant ? PriceProvider::getFinalPrice($price_ladder) : null;

            // Handle Variant Images
            // Handle Variant Images
            $rawVarImages = $variant->images;

            if (is_string($rawVarImages)) {
                $decoded = json_decode($rawVarImages, true);
                $rawVarImages = is_array($decoded) ? $decoded : [];
            }

            $variantImages = collect($rawVarImages)
                ->filter(fn($img) => !empty($img))
                ->map(fn($img) => $this->resolveImageUrl($img));


            $seller_price_record = $storeVariant
                ? $storeVariant->sellerPrices()
                    ->where('seller_id', auth()->id())
                    ->where('active', true)
                    ->first()
                : null;

            $seller_price = $seller_price_record?->price ?? null;

            $payload = [
                'id' => $variant->id,
                // ... (other fields)
                'img' => $variantImages->first() ?: ($variant->itemColor ? asset(ltrim($variant->itemColor->image_path, '/')) : '/img/default.jpg'),
                'images' => $variantImages->toArray(),
                'color' => $variant->itemColor?->name,
                'size' => $variant->itemSize?->name,
                'packaging' => $variant->itemPackagingType?->name,
                'price' => $price,
                'discount_price' => $discount_price,
                'stock' => $store_stock,
                'status' => $status,
                'store_active' => $store_active,
                'quantity' => $variant->calculateTotalPieces(),
                'price_ladder' => $price_ladder,
                'final_price' => $final_price,
                'seller_price' => $seller_price,
                'seller_discount_price' => $seller_price_record?->discount_price ?? null,
            ];

            // 🚀 LOG 2: Variant Image Debug
            Log::info("INERTIA_DEBUG: Variant {$variant->id}", [
                'url' => $payload['img']
            ]);

            return $payload;
        });
        // ... (Your existing Cart/Seller retrieval logic)
        $sellers = User::where('role', 'seller')->get();
        $customersWithOpenCarts = Customer::where('store_id', $storeId)
            ->whereHas('carts', fn($q) => $q->visibleTo(auth()->user())->open())
            ->with(['carts' => fn($q) => $q->visibleTo(auth()->user())->open()])
            ->get();

        $openCarts = Cart::with('customer')
            ->visibleTo(auth()->user())
            ->open()
            ->latest()
            ->get();

        $displayPrice = $variantData->where('status', 'active')->min('final_price') ?? $variantData->min('price');

        return Inertia::render('Seller/Items/Show', compact(
            'item',
            'sellers',
            'customersWithOpenCarts',
            'openCarts',
            'allImages',
            'variantData',
            'minStoreVariant',
            'displayPrice',
            'selectedCartId'
        ));
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(string $id)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id)
    {
        //
    }

    /**
     * Turn any stored image path into a fully-qualified URL.
     *
     * Handles all formats produced by the system:
     *   - Already a full URL          → returned as-is
     *   - uploads/variants/SKU/...    → storage disk  → asset('storage/...')
     *   - images/product_images/...   → public disk   → asset('storage/...')
     *   - /images/product_images/...  → legacy public → asset('storage/...')
     *   - storage/...                 → strip prefix  → asset('storage/...')
     */
}
