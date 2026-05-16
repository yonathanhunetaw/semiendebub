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
use Inertia\Inertia;

class ItemController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $storeId = Auth::user()->store?->id;
        // Ensure we have a string, default to empty
        $search = $request->filled('search') ? trim($request->search) : null;
        $cartId = $request->integer('cart_id') ?: null;

        $query = Item::where('status', 'true')
            ->with([
                'category',
                'variants.itemColor',
                'variants.itemSize',
                'variants.itemPackagingType',
                'variants.storeVariants' => function ($q) use ($storeId) {
                    if ($storeId) {
                        $q->where('store_id', $storeId)
                            ->with('stocks'); // 👈 Eager load stock here
                    }
                },
            ]);

        // 1. Only filter by store if storeId exists
        if ($storeId) {
            $query->whereHas('variants.storeVariants', function ($q) use ($storeId) {
                $q->where('store_id', $storeId);
            });
        }

        // 2. Only apply search if there is actually a search term
        if ($search) {
            $query->where('product_name', 'LIKE', '%' . $search . '%');
        }

        // 3. Get the results (No more ternary check here!)
        $items = $query->orderBy('product_name')->get();

        // Temporary debug
        if ($items->isEmpty()) {
            Log::info("No items found for store: " . ($storeId ?? 'N/A'));
        }
        return Inertia::render('Seller/Items/Index', [
            'items' => $items,
            'filters' => [
                'search' => $search ?? '',
                'cart_id' => $cartId,
            ],
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

        // 🔹 Process related attribute images (Color, Size, Packaging)
        $variantColorImages = $item->variants
            ->map(fn($v) => $v->itemColor?->image_path ? $this->resolveImageUrl($v->itemColor->image_path) : null)
            ->filter(fn($img) => !empty($img))
            ->unique();

        $sizeImages = $item->variants
            ->map(fn($v) => $v->itemSize?->image_path ? $this->resolveImageUrl($v->itemSize->image_path) : null)
            ->filter(fn($img) => !empty($img))
            ->unique();

        $packagingImages = $item->variants
            ->map(fn($v) => $v->itemPackagingType?->image_path ? $this->resolveImageUrl($v->itemPackagingType->image_path) : null)
            ->filter(fn($img) => !empty($img))
            ->unique();

        $allImages = $itemImages
            ->merge($variantColorImages)
            ->merge($sizeImages)
            ->merge($packagingImages)
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
    private function resolveImageUrl(string $img): string
    {
        $img = trim($img);

        if (str_starts_with($img, 'http')) {
            return $img;
        }

        $path = ltrim($img, '/');

        if (str_starts_with($path, 'storage/')) {
            return asset($path);
        }

        // Paths that live under storage/app/public/
        if (str_starts_with($path, 'uploads/') || str_starts_with($path, 'images/')) {
            return asset('storage/' . $path);
        }

        return asset($path);
    }
}
