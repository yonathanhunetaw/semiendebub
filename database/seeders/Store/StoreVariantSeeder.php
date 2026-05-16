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

            // Get sellers and customers for this store
            $sellers = User::where('store_id', $store->id)->where('role', 'seller')->get();
            $customers = Customer::where('store_id', $store->id)->get();

            foreach ($variants as $variant) {
                $priceFactor = rand(95, 105) / 100;
                $basePrice = round($this->baseVariantPrice($variant) * $priceFactor, 2);

                // Create or update the price tag for this store
                // Column 'item_id' is excluded here because it doesn't live in this table
                $storeVariant = StoreVariant::updateOrCreate([
                    'store_id'        => $store->id,
                    'item_variant_id' => $variant->id,
                ], [
                    'price'            => $basePrice,
                    'discount_price'   => rand(0, 1) ? round($basePrice * (rand(90, 99) / 100), 2) : null,
                    'discount_ends_at' => rand(0, 1) ? $now->copy()->addDays(rand(1, 10)) : null,
                    'active'           => true,
                    'manual_status'    => 'auto',
                    'created_at'       => $now,
                    'updated_at'       => $now,
                ]);

                // 3️⃣ Link stock to the ItemVariant ID, not StoreVariant ID
                ItemStock::updateOrCreate(
                    [
                        'item_variant_id' => $variant->id, 
                        'location_id'     => $store->id,    
                        'location_type'   => get_class($store),
                    ],
                    [
                        'quantity'        => rand(5, 50),
                        'min_stock_level' => 5,
                    ]
                );

                // 4️⃣ Seller prices (Tiered Pricing)
                foreach ($sellers as $seller) {
                    $factor = rand(90, 110) / 100;
                    $sellerPrice = round($basePrice * $factor, 2);

                    DB::table('store_variants_seller_prices')->updateOrInsert(
                        [
                            'store_variant_id' => $storeVariant->id,
                            'seller_id'        => $seller->id,
                        ],
                        [
                            'price'            => $sellerPrice,
                            'discount_price'   => rand(0, 1) ? round($sellerPrice * (rand(90, 99) / 100), 2) : null,
                            'discount_ends_at' => rand(0, 1) ? $now->copy()->addDays(rand(1, 10)) : null,
                            'active'           => true,
                            'created_at'       => $now,
                            'updated_at'       => $now,
                        ]
                    );
                }

                // 5️⃣ Customer prices (Tiered Pricing)
                foreach ($customers as $customer) {
                    $factor = rand(85, 105) / 100;
                    $customerPrice = round($basePrice * $factor, 2);

                    DB::table('store_variants_customer_prices')->updateOrInsert(
                        [
                            'store_variant_id' => $storeVariant->id,
                            'customer_id'      => $customer->id,
                        ],
                        [
                            'price'            => $customerPrice,
                            'discount_price'   => rand(0, 1) ? round($customerPrice * (rand(90, 99) / 100), 2) : null,
                            'discount_ends_at' => rand(0, 1) ? $now->copy()->addDays(rand(1, 10)) : null,
                            'active'           => true,
                            'created_at'       => $now,
                            'updated_at'       => $now,
                        ]
                    );
                }
            }
        }
    }

    /**
     * Calculate variant base pricing dynamically using the new design constraints.
     */
    private function baseVariantPrice(ItemVariant $variant): float
    {
        $base = 10.00;
        $name = $variant->item?->product_name ?? '';

        if (str_contains($name, 'Bic')) {
            $base = 17.00;
        } elseif (str_contains($name, 'Ring')) {
            $base = 15.00;
        } elseif (str_contains($name, 'Sticky')) {
            $base = 10.00;
        }

        // Fetch piece quantity scale multiplier directly via our pivot structure.
        // Falls back safely to 1 if no exact matching configuration is loaded yet.
        $piecesMultiplier = DB::table('item_variant_packaging_quantity')
            ->where('item_variant_id', $variant->id)
            ->where('item_packaging_type_id', 1) // 1 = Single Piece Unit
            ->value('quantity') ?? 1;

        return round($base * max(1, $piecesMultiplier), 2);
    }
}