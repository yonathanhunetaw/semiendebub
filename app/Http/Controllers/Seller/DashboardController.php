<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Models\Item\Item;
use App\Models\StockKeeper\ItemStock;
use App\Services\PriceProvider;
use App\Services\ImageResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class DashboardController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $user = Auth::user();
        $store = $user->store;

        if (!$store) {
            return Inertia::render('Seller/Dashboard/Index', [
                'items' => [],
                'store' => null,
                'error' => 'No store associated with this account.'
            ]);
        }

        $storeId = $store->id;
        $sellerId = $user->id;
        $customerId = $request->input('customer_id');

        Log::info('Seller Dashboard Loaded', [
            'store_id' => $storeId,
            'seller_id' => $sellerId,
        ]);

        // 1️⃣ Load items with relationships
        $items = Item::with([
            'variants.itemColor',
            'variants.itemSize',
            'variants.storeVariants' => function ($q) use ($storeId) {
                $q->where('store_id', $storeId);
            },
            'variants.storeVariants.sellerPrices',
            'variants.storeVariants.customerPrices',
        ])
            ->where('status', 'active')
            ->whereHas('variants.storeVariants', function ($q) use ($storeId) {
                $q->where('store_id', $storeId);
            })
            ->get();

        // 2️⃣ Load stock levels
        $storeVariantIds = $items->flatMap(fn($item) => $item->variants->pluck('storeVariants.*.id'))
            ->flatten()
            ->unique();

        $stocks = ItemStock::where('location_id', $storeId)
            ->where('location_type', get_class($store))
            ->whereIn('item_variant_id', $storeVariantIds)
            ->get()
            ->keyBy('item_variant_id');

        // 3️⃣ Process each item and variant using PriceProvider
        foreach ($items as $item) {
            // Process images
            $generalImages = $item->general_images ?? [];
            $item->image_urls = collect($generalImages)
                ->map(fn($path) => ImageResolver::resolve($path))
                ->merge($item->variants->map(fn($v) => ImageResolver::resolve($v->images[0] ?? null)))
                ->filter()
                ->unique()
                ->values();

            $variantPrices = [];

            // Process each variant
            foreach ($item->variants as $variant) {
                $storeVariant = $variant->storeVariants->where('store_id', $storeId)->first();

                if ($storeVariant) {
                    $variant->store_stock = $stocks[$storeVariant->id]->quantity ?? 0;
                    $variant->store_variant_id = $storeVariant->id;

                    // ✅ FORCE the pricing_matrix to be included
                    $matrix = $storeVariant->pricing_matrix;
                    if (is_string($matrix)) {
                        $matrix = json_decode($matrix, true);
                    }
                    $variant->pricing_matrix = $matrix;

                    // ✅ USE PRICE PROVIDER for the price ladder
                    $variant->price_ladder = PriceProvider::getPriceLadder(
                        storeVariantId: $storeVariant->id,
                        storeId: $storeId,
                        sellerId: $sellerId,
                        customerId: $customerId
                    );

                    // ✅ Get the final price from the ladder
                    $variant->final_price = PriceProvider::getFinalPrice($variant->price_ladder);

                    // ✅ Get store base price (first level of the ladder)
                    $basePriceLevel = $variant->price_ladder[0] ?? null;
                    $variant->store_price = $basePriceLevel['price'] ?? 0;
                    $variant->store_discount_price = $basePriceLevel['discount_price'] ?? null;
                    $variant->discount_ends_at = $basePriceLevel['discount_ends_at'] ?? null;

                    // ✅ Also set from matrix directly (fallback)
                    if (!$variant->store_price) {
                        $variant->store_price = $matrix['price'] ?? 0;
                    }
                    if (!$variant->store_discount_price) {
                        $variant->store_discount_price = $matrix['discount_price'] ?? null;
                    }
                    if (!$variant->discount_ends_at) {
                        $variant->discount_ends_at = $matrix['discount_ends_at'] ?? null;
                    }

                    // ✅ Track final price for item-level min calculation
                    $variantPrices[] = $variant->final_price;

                    $variant->manual_status = $storeVariant->manual_status ?? 'auto';
                    $variant->forced_status = $storeVariant->forced_status;
                    $variant->status = $storeVariant->computed_status ?? ($storeVariant->active ? 'active' : 'inactive');
                    $variant->store_active = $variant->status === 'active';
                } else {
                    $variant->manual_status = 'auto';
                    $variant->forced_status = null;
                    $variant->status = 'inactive';
                    $variant->store_active = false;
                    $variant->price_ladder = [];
                    $variant->final_price = null;
                    $variant->store_price = null;
                    $variant->store_discount_price = null;
                    $variant->discount_ends_at = null;
                    $variant->pricing_matrix = null;
                }
            }

            // ✅ Calculate item-level min price using final prices from PriceProvider
            $item->store_price = !empty($variantPrices) ? min($variantPrices) : null;

            // ✅ Get the first variant's discount info for the item card
            $firstVariant = $item->variants->first();
            if ($firstVariant) {
                $item->discount_ends_at = $firstVariant->discount_ends_at;
                $item->pricing_matrix = $firstVariant->pricing_matrix; // ✅ Add this
                $item->original_price = $firstVariant->store_price; // ✅ Add this for crossed-out price
            }
        }

        // Debug log
        if ($items->isNotEmpty()) {
            $firstItem = $items->first();
            $firstVariant = $firstItem->variants->first();
            
            Log::info('Dashboard Debug - First Item', [
                'item_name' => $firstItem->product_name,
                'item_store_price' => $firstItem->store_price,
                'item_discount_ends_at' => $firstItem->discount_ends_at ?? null,
                'has_pricing_matrix' => isset($firstVariant->pricing_matrix),
                'pricing_matrix' => $firstVariant->pricing_matrix ?? null,
            ]);
        }
        
        return Inertia::render('Seller/Dashboard/Index', [
            'items' => $items,
            'store' => $store,
        ]);
    }
}