<?php

namespace Database\Seeders\Store;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\StoreVariant;
use App\Models\Store\Store;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class StoreVariantSeeder extends Seeder
{
    public function run(): void
    {
        $stores = Store::all();
        $now = Carbon::now();

        foreach ($stores as $store) {
            // 1. Get all variants linked to items available in this store
            // In StoreVariantSeeder.php
            $variants = ItemVariant::whereHas('item.stores', function ($q) use ($store) {
                $q->where('store_id', $store->id);
            })->with(['item.packagingTypes', 'itemPackagingType'])->get();
            if ($variants->isEmpty())
                continue;

            $sellers = User::where('store_id', $store->id)->where('role', 'seller')->get();
            $customers = Customer::where('store_id', $store->id)->get();

            foreach ($variants as $variant) {
                // 2. Calculate Base Price for THIS specific variant
                $packType = $variant->itemPackagingType;
                $multiplier = (int) ($packType->pivot->quantity ?? 1);
                $baseItemPrice = $this->calculateBaseProductRate($variant);

                $price = round($baseItemPrice * $multiplier * (rand(95, 105) / 100), 2);

                // Tiered discount logic
                if ($multiplier >= 120)
                    $price *= 0.80;
                elseif ($multiplier >= 10)
                    $price *= 0.90;
                $price = round($price, 2);

                // ─── ADD THESE LINES TO DEFINE THE VARIABLES ───
                $hasDiscount = (bool) rand(0, 1);
                $discountPrice = $hasDiscount ? round($price * (rand(90, 99) / 100), 2) : null;
                $discountEnds = $hasDiscount ? $now->copy()->addDays(rand(1, 10))->toDateTimeString() : null;
                // ───────────────────────────────────────────────

                // 3. Save to StoreVariant
                // ... inside your loop
                $storeVariant = StoreVariant::updateOrCreate([
                    'store_id' => $store->id,
                    'item_variant_id' => $variant->id,
                ], [
                    'pricing_matrix' => [
                        'price' => $price,
                        'discount_price' => $discountPrice,
                        'discount_ends_at' => $discountEnds,
                    ],
                    'active' => true,
                    'manual_status' => 'auto',
                ]);

                // ... (rest of your code)
                // 4. Update Stock
                ItemStock::updateOrCreate(
                    [
                        'item_variant_id' => $variant->id,
                        'location_id' => $store->id,
                        'location_type' => Store::class,
                    ],
                    ['quantity' => rand(5, 50), 'min_stock_level' => 5]
                );

                // 5. Update Seller/Customer specific prices (Directly)
                // 5. Update Seller/Customer specific prices (Directly)
                foreach ($sellers as $seller) {
                    DB::table('store_variants_seller_prices')->updateOrInsert(
                        ['store_variant_id' => $storeVariant->id, 'seller_id' => $seller->id],
                        [
                            // Change this:
                            'pricing_matrix' => json_encode(['price' => round($price * 0.95, 2)]), 
                            'active' => true, 
                            'updated_at' => $now
                        ]
                    );
                }

                foreach ($customers as $customer) {
                    DB::table('store_variants_customer_prices')->updateOrInsert(
                        ['store_variant_id' => $storeVariant->id, 'customer_id' => $customer->id],
                        [
                            // Change this:
                            'pricing_matrix' => json_encode(['price' => round($price * 0.98, 2)]), 
                            'active' => true, 
                            'updated_at' => $now
                        ]
                    );
                }
            }
        }
    }

    private function calculateBaseProductRate(ItemVariant $variant): float
    {
        $name = $variant->item?->product_name ?? '';
        return match (true) {
            str_contains($name, 'Bic') => 17.00,
            str_contains($name, 'Ring') => 15.00,
            default => 10.00,
        };
    }
}