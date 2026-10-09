<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Seller\Cart;
use App\Services\PriceProvider;
use App\Services\ImageResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;
use App\Services\Seller\SellerCatalog;
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

        $query = app(SellerCatalog::class)->query((int) $storeId);

        if ($search) {
            $query->where('product_name', 'LIKE', '%' . $search . '%');
        }

        $startTime = microtime(true);
        $perPage = 20;
        $paginator = $query->orderBy('product_name')->paginate($perPage);
        $executionTime = round((microtime(true) - $startTime) * 1000, 2);

        $context = app(SellerCatalog::class)->cartContext($user, $cartId);
        $customer = $context['customer'];

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



        return Inertia::render('Seller/Items/Index', [
            'items' => $items,
            'nextPageUrl' => $paginator->nextPageUrl(),
            'filters' => ['search' => $search ?? '', 'cart_id' => $cartId],
            'categories' => app(SellerCatalog::class)->categories((int) $storeId),
            'has_tin_cart' => $context['has_tin_cart'],
            'top_cart_is_individual' => $context['top_cart_is_individual'],
        ]);
    }

    private ?SellerCatalog $catalog = null;

    private function enrichItemForIndex(Item $item, int $storeId, $customer = null): array
    {
        // One instance per request, so its location lookups are made once.
        return ($this->catalog ??= app(SellerCatalog::class))->present($item, $storeId, $customer);
    }

    private function resolveImageUrl(?string $path): ?string
    {
        return empty($path) ? null : ImageResolver::resolve($path);
    }

    public function search(Request $request)
    {
        $user = Auth::user();
        $storeId = $user->store?->id;

        if (! $storeId) {
            return redirect()->route('seller.dashboard');
        }

        $catalog = app(SellerCatalog::class);
        $query = trim((string) $request->input('search', ''));
        $selectedCategoryId = $request->integer('category_id') ?: null;

        // Same cart-based pricing as the Store page, so an individual cart
        // sees VAT-inclusive prices here too.
        $context = $catalog->cartContext($user, $request->integer('cart_id') ?: null);

        $matching = fn () => $catalog->query((int) $storeId)
            ->when($query !== '', fn ($q) => $q->where('product_name', 'LIKE', "%{$query}%"));

        $paginator = $matching()
            ->when($selectedCategoryId, fn ($q) => $q->where('item_category_id', $selectedCategoryId))
            ->orderBy('product_name')
            ->paginate(20, ['*'], 'page', $request->integer('page', 1));

        $items = collect($paginator->items())
            ->map(fn (Item $item) => $catalog->present($item, (int) $storeId, $context['customer']));

        // Categories among every match (not just this page), for the filter pills.
        $categoryIds = $matching()->setEagerLoads([])->whereNotNull('item_category_id')->distinct()->pluck('item_category_id');
        $categories = \App\Models\Item\ItemCategory::whereIn('id', $categoryIds)
            ->orderBy('category_name')
            ->get(['id', 'category_name']);

        return Inertia::render('Seller/Items/SearchResults', [
            'query' => $query,
            'items' => $items,
            'nextPageUrl' => $paginator->nextPageUrl(),
            'categories' => $categories,
            'selectedCategoryId' => $selectedCategoryId,
            'has_tin_cart' => $context['has_tin_cart'],
            'top_cart_is_individual' => $context['top_cart_is_individual'],
        ]);
    }

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

        $query = app(SellerCatalog::class)->query((int) $storeId);

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
            'variants.storeVariants' => function ($query) use ($storeId) {
                $query->where('store_id', $storeId)
                    ->where('active', true)
                    ->with([
                        'sellerPrices',
                        'customerPrices',
                        // Unconstrained, this counts the variant's stock at
                        // every store — see StoreVariant::stocks().
                        'stocks' => function ($stockQuery) use ($storeId) {
                            // Shelf + floor (STOCK_PLAN.md phase 4).
                                        $stockQuery->whereIn('stock_location_id', app(\App\Services\Inventory\StockScope::class)->storeLeafIds((int) $storeId));
                        },
                    ]);
            },
            // 'variants.storeVariants.sellerPrices',
            'variants.owner',
        ]);

        $storeVariants = $item->variants->flatMap(fn($v) => $v->storeVariants)
            ->filter(fn($storeVariant) => $storeVariant->active);

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
        $storeVariantIds = $item->variants->flatMap(fn($v) => $v->storeVariants->where('store_id', $storeId))->pluck('id')->toArray();
        $stocks = app(\App\Services\StockService::class)->getBatchStock($storeVariantIds);

        $catalog = app(SellerCatalog::class);
        $leaves = $storeId ? $catalog->storeLeaves((int) $storeId) : ['shelf' => [], 'floor' => [], 'remote' => null];

        $variantData = $item->variants->map(function ($variant) use ($storeId, $sellerId, $customerId, $customerType, $stocks, $catalog, $leaves) {
            // Get the store variant for the current store
            $storeVariant = $variant->storeVariants->where('store_id', $storeId)->first();
            if (app()->environment('testing') && is_null($storeVariant)) {
                // This will stop the test and show you the IDs
                dd([
                    'looking_for_store_id' => $storeId,
                    'available_store_variants' => $variant->storeVariants->toArray()
                ]);
            }

            // 🛑 FIX: Use StockService SSOT ledger for stock
            $store_stock = $storeVariant ? ($stocks[$storeVariant->id] ?? 0) : 0;

            // Sellers see the Store Shelf and Store Floor; the store's own
            // Remote Hub only as "stocked there", since reaching it is a transfer.
            $variantStocks = $storeVariant?->stocks ?? collect();
            $shelf_stock = (int) $variantStocks->whereIn('stock_location_id', $leaves['shelf'])->sum('quantity');
            $floor_stock = (int) $variantStocks->whereIn('stock_location_id', $leaves['floor'])->sum('quantity');
            $in_remote_hub = $storeId !== null && $catalog->inRemoteHub((int) $storeId, [(int) $variant->id]);

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
            $individualTier = collect($price_ladder)->firstWhere('level', 'individual');
            $displayTier = $customerType === 'individual' ? ($individualTier ?? $basePriceLevel) : $basePriceLevel;
            $rawBasePrice = $displayTier['price'] ?? null;
            $rawDiscountPrice = $displayTier['discount_price'] ?? null;

            // Handle fallback to raw matrix just in case
            if ($storeVariant && !$rawBasePrice) {
                $matrix = is_string($storeVariant->pricing_matrix) ? json_decode($storeVariant->pricing_matrix, true) : $storeVariant->pricing_matrix;
                $matrix = (isset($matrix[0]) && is_array($matrix[0])) ? $matrix[0] : ($matrix ?? []);
                $rawBasePrice = $matrix['price'] ?? null;
                $rawDiscountPrice = $matrix['discount_price'] ?? null;
            }

            $price = $rawBasePrice;
            $discount_price = $rawDiscountPrice;

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
                'shelf_stock' => $shelf_stock,
                'floor_stock' => $floor_stock,
                'in_remote_hub' => $in_remote_hub,
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
        })->filter(fn($variant) => $variant['store_active'])->values();
        // ... (Your existing Cart/Seller retrieval logic)
        $sellers = User::where('role', 'seller')->get();
        $customersWithOpenCarts = Customer::where('store_id', $storeId)
            ->whereHas('carts', fn($q) => $q->visibleTo(auth()->user())->open())
            ->with(['carts' => fn($q) => $q->visibleTo(auth()->user())->open()])
            ->get();

        $openCarts = Cart::with('customer')
            ->visibleTo(auth()->user())
            ->open()
            ->orderBy('priority', 'asc')
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
