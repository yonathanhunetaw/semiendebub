<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Admin\Controller;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Seller\Cart;
use App\Services\ImageResolver;
use App\Services\PriceProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class ItemController extends Controller
{
    public function index(Request $request)
    {
        $storeId = Auth::user()->store?->id;
        $search  = $request->filled('search') ? trim($request->search) : null;
        $cartId  = $request->integer('cart_id') ?: null;

        $query = Item::where('status', 'true')
            ->with([
                'category',
                'variants.itemColor',
                'variants.itemSize',
                'variants.itemPackagingType',
                'variants.storeVariants' => function ($q) use ($storeId) {
                    if ($storeId) {
                        $q->where('store_id', $storeId)->with('stocks');
                    }
                },
            ]);

        if ($storeId) {
            $query->whereHas('variants.storeVariants', fn($q) => $q->where('store_id', $storeId));
        }

        if ($search) {
            $query->where('product_name', 'LIKE', '%' . $search . '%');
        }

        $items = $query->orderBy('product_name')->get();

        if ($items->isEmpty()) {
            Log::info("No items found for store: " . ($storeId ?? 'N/A'));
        }

        return Inertia::render('Admin/Items/Index', [
            'items'   => $items,
            'filters' => [
                'search'  => $search ?? '',
                'cart_id' => $cartId,
            ],
        ]);
    }

    public function create()
    {
        //
    }

    public function store(Request $request)
    {
        //
    }

    public function show(Item $item)
    {
        $store    = Auth::user()->store;
        $storeId  = $store?->id;

        $sellerId       = request('seller_id');
        $customerId     = request('customer_id');
        $selectedCartId = request('cart_id');

        $item->load([
            'variants.itemColor',
            'variants.itemSize',
            'variants.itemPackagingType',
            'variants.storeVariants.sellerPrices',
            'variants.storeVariants.customerPrices',
            'variants.storeVariants.stocks',
            'variants.owner',
        ]);

        $storeVariants = $item->variants->flatMap(fn($v) => $v->storeVariants);

        $minStoreVariant = $storeVariants
            ->filter(fn($sv) => $sv->computed_status === 'active')
            ->sortBy(fn($sv) => $sv->discount_price ?? $sv->price)
            ->first();

        // ── General item images ──────────────────────────────────────────────
        // general_images stores raw keys; resolve them all at once.
        $itemImages = collect(ImageResolver::resolveAll($item->general_images ?? []));

        // Attribute images (color, size, packaging)
        $variantColorImages = $item->variants
            ->map(fn($v) => $v->itemColor?->image_path ? ImageResolver::resolve($v->itemColor->image_path) : null)
            ->filter()->unique();

        $sizeImages = $item->variants
            ->map(fn($v) => $v->itemSize?->image_path ? ImageResolver::resolve($v->itemSize->image_path) : null)
            ->filter()->unique();

        $packagingImages = $item->variants
            ->map(fn($v) => $v->itemPackagingType?->image_path ? ImageResolver::resolve($v->itemPackagingType->image_path) : null)
            ->filter()->unique();

        $allImages = $itemImages
            ->merge($variantColorImages)
            ->merge($sizeImages)
            ->merge($packagingImages)
            ->filter()->unique()->values();

        // ── Variant data ─────────────────────────────────────────────────────
        $variantData = $item->variants->map(function ($variant) use ($storeId, $sellerId, $customerId) {
            $storeVariant = $variant->storeVariants->where('store_id', $storeId)->first();

            $stockRecord = $storeVariant?->stocks
                ->where('location_id', $storeId)
                ->where('location_type', 'App\Models\Store\Store')
                ->first();

            $store_stock   = $stockRecord?->quantity ?? 0;
            $price         = $storeVariant?->price;
            $discount_price = $storeVariant?->discount_price;
            $status        = $storeVariant?->computed_status ?? 'inactive';
            $store_active  = $status === 'active';

            $price_ladder = $storeVariant
                ? PriceProvider::getPriceLadder(
                    storeVariantId: $storeVariant->id,
                    storeId: $storeId,
                    sellerId: $sellerId,
                    customerId: $customerId
                )
                : [];

            $final_price = $storeVariant ? PriceProvider::getFinalPrice($price_ladder) : null;

            // Resolve variant images — images column holds raw MinIO keys
            $variantImages = collect(ImageResolver::resolveAll($variant->images ?? []));

            $seller_price_record = $storeVariant
                ? $storeVariant->sellerPrices()
                    ->where('seller_id', auth()->id())
                    ->where('active', true)
                    ->first()
                : null;

            $primaryImage = $variantImages->first()
                ?? ($variant->itemColor?->image_path
                    ? ImageResolver::resolve($variant->itemColor->image_path)
                    : asset('images/defaults/no-image.png'));

            return [
                'id'                    => $variant->id,
                'img'                   => $primaryImage,
                'images'                => $variantImages->toArray(),
                'color'                 => $variant->itemColor?->name,
                'size'                  => $variant->itemSize?->name,
                'packaging'             => $variant->itemPackagingType?->name,
                'price'                 => $price,
                'discount_price'        => $discount_price,
                'stock'                 => $store_stock,
                'status'                => $status,
                'store_active'          => $store_active,
                'quantity'              => $variant->calculateTotalPieces(),
                'price_ladder'          => $price_ladder,
                'final_price'           => $final_price,
                'seller_price'          => $seller_price_record?->price,
                'seller_discount_price' => $seller_price_record?->discount_price,
            ];
        });

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

        $displayPrice = $variantData->where('status', 'active')->min('final_price')
            ?? $variantData->min('price');

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

    public function edit(string $id)
    {
        //
    }

    public function update(Request $request, string $id)
    {
        //
    }

    public function destroy(string $id)
    {
        //
    }
}
