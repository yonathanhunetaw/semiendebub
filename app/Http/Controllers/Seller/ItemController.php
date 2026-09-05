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

        $topCart = \App\Models\Seller\Cart::with('customer')
            ->where('seller_id', $user->id)
            ->where('status', 'open')
            ->orderBy('priority', 'asc')
            ->first();

        $cart = $cartId ? \App\Models\Seller\Cart::with('customer')->find($cartId) : $topCart;
        $customer = $cart ? $cart->customer : null;

        $items = collect($paginator->items())->map(function ($item) use ($storeId, $customer) {
            return $this->enrichItemForIndex($item, $storeId, $customer);
        });

        Log::info("Items index (paginated)", [
            'store_id' => $storeId,
            'page' => $paginator->currentPage(),
            'per_page' => $perPage,
            'total' => $paginator->total(),
            'execution_ms' => $executionTime,
        ]);

        // After $items = collect(...)->map(...)
        $categoryNames = $items
            ->pluck('category.category_name')
            ->filter()
            ->unique()
            ->values()
            ->toArray();

        $hasTinCart = $cart && ($cart->customer_id === null || !empty($cart->customer?->tin_number));
        $topCartIsIndividual = $cart && ($cart->customer_id === null || !empty($cart->customer?->tin_number));

        return Inertia::render('Seller/Items/Index', [
            'items' => $items,
            'nextPageUrl' => $paginator->nextPageUrl(),
            'filters' => ['search' => $search ?? '', 'cart_id' => $cartId],
            'categories' => $categoryNames,
            'has_tin_cart' => $hasTinCart,
            'top_cart_is_individual' => $topCartIsIndividual,
        ]);
    }

    private function enrichItemForIndex(Item $item, int $storeId, $customer = null): array
    {
        // 1. Restore Image Resolution Logic
        $generalImages = is_string($item->general_images) ? json_decode($item->general_images, true) : ($item->general_images ?? []);

        $variantImages = collect();
        foreach ($item->variants as $variant) {
            $raw = is_string($variant->images) ? json_decode($variant->images, true) : ($variant->images ?? []);
            foreach ((array) $raw as $img) {
                if (!empty($img))
                    $variantImages->push($this->resolveImageUrl($img));
            }
        }

        $imageUrls = collect((array) $generalImages)
            ->map(fn($path) => $this->resolveImageUrl($path))
            ->merge($variantImages)
            ->filter()
            ->unique()
            ->values()
            ->toArray();

        $sellerId = Auth::id();
        $priceInfo = PriceProvider::getItemPriceRange($item, $storeId, $sellerId, $customer);

        $totalStock = 0;
        foreach ($item->variants as $variant) {
            foreach ($variant->storeVariants->where('store_id', $storeId) as $sv) {
                $totalStock += (int) $sv->stocks->sum('quantity');
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
            'store_stock' => $totalStock,
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
            return redirect()->route('seller.dashboard');
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

            $priceInfo = \App\Services\PriceProvider::getItemPriceRange($item, $storeId, $sellerId, $customerId);

            $totalStock = 0;
            foreach ($item->variants as $variant) {
                $storeVariant = $variant->storeVariants->where('store_id', $storeId)->first();
                if ($storeVariant) {
                    $totalStock += $stocks[$storeVariant->id]->quantity ?? 0;
                }
            }

            $item->original_price = $priceInfo['store_price'];
            $item->store_price = $priceInfo['store_price'];
            $item->final_price = $priceInfo['final_price'];
            $item->discount_ends_at = $priceInfo['discount_ends_at'];
            $item->pricing_matrix = $priceInfo['pricing_matrix'];
            $item->store_stock = $totalStock;

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
     * JSON-only endpoint for infinite scroll pagination.
     * Called directly via fetch() — does NOT go through Inertia.
     */
    public function pageItems(Request $request)
    {
        $user = Auth::user();
        $storeId = $user->store?->id;

        if (!$storeId) {
            return response()->json(['items' => [], 'nextPageUrl' => null]);
        }

        $page = $request->integer('page', 2);
        $perPage = 20;
        $search = $request->filled('search') ? trim($request->search) : null;
        $cartId = $request->integer('cart_id') ?: null;

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
            ])
            ->whereHas('variants.storeVariants', function ($q) use ($storeId) {
                $q->where('store_id', $storeId);
            });

        if ($search) {
            $query->where('product_name', 'LIKE', '%' . $search . '%');
        }

        $paginator = $query->orderBy('product_name')->paginate($perPage, ['*'], 'page', $page);

        $topCart = \App\Models\Seller\Cart::with('customer')
            ->where('seller_id', Auth::id())
            ->where('status', 'open')
            ->orderBy('priority', 'asc')
            ->first();

        $cart = $cartId ? \App\Models\Seller\Cart::with('customer')->find($cartId) : $topCart;
        $customer = $cart ? $cart->customer : null;
        $hasTinCart = $cart && $cart->customer && !empty($cart->customer->tin_number);

        $items = collect($paginator->items())->map(function ($item) use ($storeId, $customer) {
            return $this->enrichItemForIndex($item, $storeId, $customer);
        });

        return response()->json([
            'items' => $items,
            'nextPageUrl' => $paginator->nextPageUrl(),
            'has_tin_cart' => $hasTinCart,
        ]);
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

        $sellerId = request('seller_id') ?? Auth::id();
        $selectedCartId = request('cart_id');

        // Resolve customer from cart (matching index/dashboard logic)
        $topCart = \App\Models\Seller\Cart::with('customer')
            ->where('seller_id', Auth::id())
            ->where('status', 'open')
            ->orderBy('priority', 'asc')
            ->first();

        $cart = $selectedCartId
            ? \App\Models\Seller\Cart::with('customer')->find($selectedCartId)
            : $topCart;

        $customer = $cart?->customer;
        $customerId = $customer?->id;

        // Cart without customer = individual walk-in; Customer with TIN = individual; Customer without TIN = business
        if ($customer === null) {
            $customerType = 'individual';
            $hasTin = true;
        } else {
            $hasTin = is_object($customer) && !empty($customer->tin_number);
            $customerType = $hasTin ? 'individual' : 'business';
        }

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
        $variantData = $item->variants->map(function ($variant) use ($storeId, $sellerId, $customerId, $customerType) {
            // Get the store variant for the current store
            $storeVariant = $variant->storeVariants->where('store_id', $storeId)->first();
            if (app()->environment('testing') && is_null($storeVariant)) {
                // This will stop the test and show you the IDs
                dd([
                    'looking_for_store_id' => $storeId,
                    'available_store_variants' => $variant->storeVariants->toArray()
                ]);
            }

            // 🛑 FIX: Get stock from the item_stocks relationship, summed for this store
            $store_stock = (int) ($storeVariant?->stocks
                ->where('location_id', $storeId)
                ->sum('quantity') ?? $storeVariant?->stocks->sum('quantity') ?? $storeVariant?->stock ?? 0);

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
            $final_price = $storeVariant ? PriceProvider::getFinalPriceWithTax($price_ladder, $customerType) : null;

            $basePriceLevel = $price_ladder[0] ?? null;
            // Use the raw base price from the store tier (with VAT if individual, for accurate strikethrough)
            $rawBasePrice = $basePriceLevel['price'] ?? null;
            $rawDiscountPrice = $basePriceLevel['discount_price'] ?? null;

            // Handle fallback to raw matrix just in case
            if ($storeVariant && !$rawBasePrice) {
                $matrix = is_string($storeVariant->pricing_matrix) ? json_decode($storeVariant->pricing_matrix, true) : $storeVariant->pricing_matrix;
                $matrix = (isset($matrix[0]) && is_array($matrix[0])) ? $matrix[0] : ($matrix ?? []);
                $rawBasePrice = $matrix['price'] ?? null;
                $rawDiscountPrice = $matrix['discount_price'] ?? null;
            }

            $price = ($rawBasePrice !== null && $customerType === 'individual') ? round($rawBasePrice * 1.15, 2) : $rawBasePrice;
            $discount_price = ($rawDiscountPrice !== null && $customerType === 'individual') ? round($rawDiscountPrice * 1.15, 2) : $rawDiscountPrice;

            // Extract Seller and Customer prices directly from the ladder (since it resolves expired discounts, overrides, etc.)
            $sellerTier = collect($price_ladder)->firstWhere('level', 'seller');
            $seller_price = $sellerTier['price'] ?? null;
            $seller_discount_price = $sellerTier['discount_price'] ?? null;

            $customerTier = collect($price_ladder)->firstWhere('level', 'customer');
            $customer_price = $customerTier['price'] ?? null;
            $customer_discount_price = $customerTier['discount_price'] ?? null;

            // Handle Variant Images
            $rawVarImages = $variant->images;
            if (is_string($rawVarImages)) {
                $decoded = json_decode($rawVarImages, true);
                $rawVarImages = is_array($decoded) ? $decoded : [];
            }
            $variantImages = collect($rawVarImages)
                ->filter(fn($img) => !empty($img))
                ->map(fn($img) => $this->resolveImageUrl($img));

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
                'seller_discount_price' => $seller_discount_price,
                'customer_price' => $customer_price,
                'customer_discount_price' => $customer_discount_price,
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
        $hasTinCart = $hasTin;
        $has_tin_cart = $hasTin;

        return Inertia::render('Seller/Items/Show', compact(
            'item',
            'sellers',
            'customersWithOpenCarts',
            'openCarts',
            'allImages',
            'variantData',
            'minStoreVariant',
            'displayPrice',
            'selectedCartId',
            'has_tin_cart',
            'hasTinCart'
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
