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

            // 2️⃣ Get physical variants of those items
            $variants = ItemVariant::whereIn('item_id', $itemIds)->get();

            // Get sellers and customers for this store
            $sellers = User::where('store_id', $store->id)->where('role', 'seller')->get();
            $customers = Customer::where('store_id', $store->id)->get();

            foreach ($variants as $variant) {
                // Fetch all packaging variations configured for this item variant
                $variant->load('item.packagingTypes');
                $packagingTypes = $variant->item?->packagingTypes ?? collect();

                if ($packagingTypes->isEmpty()) {
                    continue; // Skip if no packaging tiers are defined yet
                }

                $baseItemPrice = $this->calculateBaseProductRate($variant);
                $storePriceFactor = rand(95, 105) / 100;

                // ─── 1. GENERATE STORE PRICING MATRIX ─────────────────────────
                $storeMatrix = [];
                foreach ($packagingTypes as $index => $packType) {
                    $multiplier = (int) ($packType->pivot->quantity ?? 1);
                    $calculatedPrice = $baseItemPrice * $multiplier * $storePriceFactor;

                    // Bulk volume tiered markdowns
                    if ($multiplier >= 120) {
                        $calculatedPrice *= 0.80; // 20% Carton discount
                    } elseif ($multiplier >= 10) {
                        $calculatedPrice *= 0.90; // 10% Packet discount
                    }

                    // Optional promotional logic inside the tier context
                    $hasDiscount = (bool) rand(0, 1);
                    $discountPrice = $hasDiscount ? round($calculatedPrice * (rand(90, 99) / 100), 2) : null;
                    $discountEnds = $hasDiscount ? $now->copy()->addDays(rand(1, 10))->toDateTimeString() : null;

                    // Match up your specific file names
                    $prefix = $variant->item?->file_prefix ?? '2025-1';
                    $targetFileNumber = ($index % 5) + 1;
                    $packageMinioKey = "uploads/items/{$variant->item_id}/{$prefix}_{$targetFileNumber}.jpg";

                    $storeMatrix[] = [
                        'packaging_type_id' => $packType->id,
                        'unit_name'         => $packType->name,
                        'multiplier'        => $multiplier,
                        'price'             => round($calculatedPrice, 2),
                        'discount_price'    => $discountPrice,
                        'discount_ends_at'  => $discountEnds,
                        'image'             => $packageMinioKey,
                    ];
                }

                // Save or Update the main store variant record
                $storeVariant = StoreVariant::updateOrCreate([
                    'store_id'        => $store->id,
                    'item_variant_id' => $variant->id,
                ], [
                    'pricing_matrix'   => $storeMatrix, // 🎯 FIXED: Saved as JSON array
                    'active'           => true,
                    'manual_status'    => 'auto',
                    'created_at'       => $now,
                    'updated_at'       => $now,
                ]);

                // 3️⃣ Link stock levels to the physical pool
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

                // ─── 2. GENERATE SELLER PRICING MATRIX ─────────────────────────
                foreach ($sellers as $seller) {
                    $sellerMatrix = [];
                    $sellerFactor = rand(90, 110) / 100;

                    foreach ($storeMatrix as $row) {
                        $sellerPrice = $row['price'] * $sellerFactor;
                        $hasDiscount = (bool) rand(0, 1);

                        $sellerMatrix[] = array_merge($row, [
                            'price'            => round($sellerPrice, 2),
                            'discount_price'   => $hasDiscount ? round($sellerPrice * (rand(90, 99) / 100), 2) : null,
                            'discount_ends_at' => $hasDiscount ? $now->copy()->addDays(rand(1, 10))->toDateTimeString() : null,
                        ]);
                    }

                    DB::table('store_variants_seller_prices')->updateOrInsert(
                        [
                            'store_variant_id' => $storeVariant->id,
                            'seller_id'        => $seller->id,
                        ],
                        [
                            'pricing_matrix'   => json_encode($sellerMatrix), // 🎯 FIXED
                            'active'           => true,
                            'created_at'       => $now,
                            'updated_at'       => $now,
                        ]
                    );
                }

                // ─── 3. GENERATE CUSTOMER PRICING MATRIX ───────────────────────
                foreach ($customers as $customer) {
                    $customerMatrix = [];
                    $customerFactor = rand(85, 105) / 100;

                    foreach ($storeMatrix as $row) {
                        $customerPrice = $row['price'] * $customerFactor;
                        $hasDiscount = (bool) rand(0, 1);

                        $customerMatrix[] = array_merge($row, [
                            'price'            => round($customerPrice, 2),
                            'discount_price'   => $hasDiscount ? round($customerPrice * (rand(90, 99) / 100), 2) : null,
                            'discount_ends_at' => $hasDiscount ? $now->copy()->addDays(rand(1, 10))->toDateTimeString() : null,
                        ]);
                    }

                    DB::table('store_variants_customer_prices')->updateOrInsert(
                        [
                            'store_variant_id' => $storeVariant->id,
                            'customer_id'      => $customer->id,
                        ],
                        [
                            'pricing_matrix'   => json_encode($customerMatrix), // 🎯 FIXED
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
     * Calculate variant base item pricing rules safely.
     */
    private function calculateBaseProductRate(ItemVariant $variant): float
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

        return $base;
    }
}