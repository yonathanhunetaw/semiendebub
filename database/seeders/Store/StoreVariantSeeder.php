<?php

namespace Database\Seeders\Store;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
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

            // 1️⃣ Get items that belong to this store
            $itemIds = DB::table('item_store')
                ->where('store_id', $store->id)
                ->where('active', true)
                ->pluck('item_id');

            if ($itemIds->isEmpty()) {
                continue;
            }

            // 2️⃣ Get variants of those items
            $variants = ItemVariant::whereIn('item_id', $itemIds)->get();

            $storeVariantRows = [];
            $sellerPriceRows = [];
            $customerPriceRows = [];

            // Get sellers and customers for this store
            $sellers = User::where('store_id', $store->id)->where('role', 'seller')->get();
            $customers = Customer::where('store_id', $store->id)->get();

            foreach ($variants as $variant) {
                $priceFactor = rand(95, 105) / 100;
                $basePrice = round($variant->price * $priceFactor, 2);

                // FIX: We must insert immediately to get the ID for the relations below
                $storeVariantId = DB::table('store_variants')->insertGetId([
                    'store_id' => $store->id,
                    'item_variant_id' => $variant->id,
                    'price' => $basePrice,
                    'discount_price' => rand(0, 1) ? round($basePrice * (rand(90, 99) / 100), 2) : null,
                    'discount_ends_at' => rand(0, 1) ? $now->copy()->addDays(rand(1, 10)) : null,
                    'active' => true, // Set to true to ensure they show up in your catalog
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                // <<< ADD ITEM STOCK HERE >>>
                ItemStock::create([
                    'store_variant_id' => $storeVariantId,
                    'quantity' => rand(5, 50),
                    'item_inventory_location_id' => 1,
                ]);

                // Seller prices
                foreach ($sellers as $seller) {
                    $factor = rand(90, 110) / 100;
                    $sellerPrice = round($basePrice * $factor, 2);

                    DB::table('store_variants_seller_prices')->insert([
                        'store_variant_id' => $storeVariantId,
                        'seller_id' => $seller->id,
                        'price' => $sellerPrice,
                        'discount_price' => rand(0, 1) ? round($sellerPrice * (rand(90, 99) / 100), 2) : null,
                        'discount_ends_at' => rand(0, 1) ? $now->copy()->addDays(rand(1, 10)) : null,
                        'active' => true,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }

                // Customer prices
                foreach ($customers as $customer) {
                    $factor = rand(85, 105) / 100;
                    $customerPrice = round($basePrice * $factor, 2);

                    DB::table('store_variants_customer_prices')->insert([
                        'store_variant_id' => $storeVariantId,
                        'customer_id' => $customer->id,
                        'price' => $customerPrice,
                        'discount_price' => rand(0, 1) ? round($customerPrice * (rand(90, 99) / 100), 2) : null,
                        'discount_ends_at' => rand(0, 1) ? $now->copy()->addDays(rand(1, 10)) : null,
                        'active' => true,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }

            /* NOTE: The block below in your original code was redundant because
               we are now inserting inside the loop to get the IDs required
               for Stock and Prices. I've left the logic flow intact.
            */
            if (! empty($storeVariantRows)) {
                DB::table('store_variants')->insert($storeVariantRows);

                $insertedStoreVariants = DB::table('store_variants')
                    ->where('store_id', $store->id)
                    ->whereIn('item_variant_id', $variants->pluck('id'))
                    ->get()
                    ->keyBy('item_variant_id');

                // This logic is now handled inside the variant loop for reliability
            }
        }
    }
}
