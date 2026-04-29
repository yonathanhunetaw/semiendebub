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

        $query = Item::where('status', 'active')
            ->with([
                'category',
                'variants.storeVariants' => function ($q) use ($storeId) {
                    if ($storeId) {
                        $q->where('store_id', $storeId);
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
            'variants.storeVariants',
            'variants.owner',
        ]);

        $storeVariants = $item->variants->flatMap(fn($v) => $v->storeVariants);

        $minStoreVariant = $storeVariants
            ->filter(fn($sv) => $sv->computed_status === 'active')
            ->sortBy(fn($sv) => $sv->discount_price ?? $sv->price)
            ->first();

        // 🔹 Build item images
        // 🔹 Build item images
        $itemImages = collect();
        $rawImages = $item->product_images;
        if (!empty($rawImages)) {
            $imagesArray = is_string($rawImages) ? json_decode($rawImages, true) : $rawImages;
            if (is_array($imagesArray)) {
                $itemImages = collect($imagesArray)
                    ->filter(fn($img) => !empty($img))
                    ->map(fn($img) => str_starts_with($img, 'http') ? $img : asset(ltrim($img, '/')));
            }
        }

        // 🔹 Process related attribute images (Color, Size, Packaging)
        // 🔹 Process related attribute images (Color, Size, Packaging)
        $variantColorImages = $item->variants
            ->map(fn($v) => $v->itemColor?->image_path ? asset(ltrim($v->itemColor->image_path, '/')) : null)
            ->filter(fn($img) => !empty($img) && $img !== url('/'))
            ->unique();

        $sizeImages = $item->variants
            ->map(fn($v) => $v->itemSize?->image_path ? asset(ltrim($v->itemSize->image_path, '/')) : null)
            ->filter(fn($img) => !empty($img) && $img !== url('/'))
            ->unique();

        $packagingImages = $item->variants
            ->map(fn($v) => $v->itemPackagingType?->image_path ? asset(ltrim($v->itemPackagingType->image_path, '/')) : null)
            ->filter(fn($img) => !empty($img) && $img !== url('/'))
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
            $storeVariant = $variant->storeVariants->where('store_id', $storeId)->first();

            $store_stock = $storeVariant?->stock ?? 0;
            $price = $storeVariant?->price ?? $variant->price;
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
                ->map(function ($img) {
                    if (str_starts_with($img, 'http'))
                        return $img;

                    // IMPORTANT: Your disk has "blue/null/piece"
                    // If the database string is "blue/piece", we MUST add the null back.
                    // If the database string is "blue/null/piece", we just leave it.
                    $path = ltrim($img, '/');

                    return asset($path);
                });


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
        $customersWithOpenCarts = Customer::whereHas('carts', fn($q) => $q->where('status', 'open'))
            ->with(['carts' => fn($q) => $q->where('status', 'open')])->get();

        $openCarts = Cart::with('customer')
            ->where(fn($q) => $q->where('seller_id', auth()->id())->orWhere('user_id', auth()->id()))
            ->where('status', 'open')->latest()->get();

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
}
