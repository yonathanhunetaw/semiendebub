<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Models\Item\Item;
use App\Models\StockKeeper\ItemStock;
use App\Services\PriceProvider;
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
        $store = Auth::user()->store;
        if (!$store) {
            return Inertia::render('Seller/Dashboard/Index', [
                'items' => [],
                'store' => null,
                'error' => 'No store associated with this account.'
            ]);
        }
        $storeId = $store->id;
        Log::info('Seller Store ID: ' . $storeId);

        $sellerId = $request->input('seller_id');
        $customerId = $request->input('customer_id');

        // 1️⃣ Load items with updated database relationship configurations
        $items = Item::with([
            'variants.itemColor',
            'variants.itemSize',
            // 🎯 FIXED: Removed obsolete variants.itemPackagingType connection layer
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

        // 2️⃣ Load stock levels safely for the store pool
        $storeVariantIds = $items->flatMap(fn($item) => $item->variants->pluck('storeVariants.*.id'))
            ->flatten()
            ->unique();

        $stocks = ItemStock::where('location_id', $storeId)
            ->where('location_type', get_class($store))
            ->whereIn('item_variant_id', $storeVariantIds)
            ->get()
            ->keyBy('item_variant_id');

        // 3️⃣ Process each product unit line using structural matrix layers
        foreach ($items as $item) {
            // ADD THIS: Find the minimum price among all variants for this item
            // We map the variant prices and take the min()
            $item->store_price = $item->variants
                ->map(fn($v) => $v->storeVariants->where('store_id', $storeId)->first()?->pricing_matrix['price'] ?? 0)
                ->filter()
                ->min();
            foreach ($item->variants as $variant) {
                $storeVariant = $variant->storeVariants->where('store_id', $storeId)->first();

                if ($storeVariant) {
                    $variant->store_stock = $stocks[$storeVariant->id]->quantity ?? 0;
                    $variant->store_variant_id = $storeVariant->id;

                    // 🎯 FIXED: Pulling from JSON pricing matrix fallback arrays instead of dead columns
                    $matrix = $storeVariant->pricing_matrix ?? [];
                    $baseRow = $matrix[0] ?? null;

                    $variant->store_price = $baseRow['price'] ?? 0.00;
                    $variant->store_discount_price = $baseRow['discount_price'] ?? null;
                    $variant->discount_ends_at = $baseRow['discount_ends_at'] ?? null;

                    $variant->manual_status = $storeVariant->manual_status ?? 'auto';
                    $variant->forced_status = $storeVariant->forced_status;
                    $variant->status = $storeVariant->computed_status ?? ($storeVariant->active ? 'active' : 'inactive');
                    $variant->store_active = $variant->status === 'active';

                    // Dynamic price ladders computed by system micro-engines
                    $variant->price_ladder = PriceProvider::getPriceLadder(
                        storeVariantId: $storeVariant->id,
                        storeId: $storeId,
                        sellerId: $sellerId,
                        customerId: $customerId
                    );
                    $variant->final_price = PriceProvider::getFinalPrice($variant->price_ladder);
                } else {
                    $variant->manual_status = 'auto';
                    $variant->forced_status = null;
                    $variant->status = 'inactive';
                    $variant->store_active = false;
                    $variant->price_ladder = [];
                    $variant->final_price = null;
                }
            }
        }

        Log::info('Seller Items Loaded on Dashboard', [
            'store_id' => $storeId,
            'items_count' => $items->count(),
        ]);

        return Inertia::render('Seller/Dashboard/Index', compact('items', 'store'));
    }
}