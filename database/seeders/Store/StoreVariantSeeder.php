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
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $stores = Store::all();
        $now = Carbon::now();
        
        // Optional: set to true if you also want seller/customer/individual prices (can be very heavy)
        $createSellerPrices = false;
        $createCustomerPrices = false;
        $createIndividualPrices = true; // One override per variant — lightweight

        foreach ($stores as $store) {
            $this->command->info("Processing store: {$store->name} (ID: {$store->id})");

            // Get variants belonging to this store (via item.stores)
            $variants = ItemVariant::whereHas('item.stores', function ($q) use ($store) {
                $q->where('store_id', $store->id);
            })->get();

            if ($variants->isEmpty()) {
                $this->command->warn("No variants for store {$store->id}, skipping.");
                continue;
            }

            // Pre‑fetch sellers and customers for this store only if needed
            $sellers = $createSellerPrices ? User::where('store_id', $store->id)->where('role', 'seller')->get() : collect();
            $customers = $createCustomerPrices ? Customer::where('store_id', $store->id)->get() : collect();

            $storeVariantsData = [];
            $stocksData = [];
            
            foreach ($variants as $variant) {
                // Calculate base price for this variant
                $baseItemPrice = $this->calculateBaseProductRate($variant);
                $packType = $variant->itemPackagingType;
                $multiplier = (int) ($packType->pivot->quantity ?? 1);
                $price = round($baseItemPrice * $multiplier * (rand(95, 105) / 100), 2);

                // Tiered discount logic
                if ($multiplier >= 120) $price *= 0.80;
                elseif ($multiplier >= 10) $price *= 0.90;
                $price = round($price, 2);

                $hasDiscount = (bool) rand(0, 1);
                $discountPrice = $hasDiscount ? round($price * (rand(90, 99) / 100), 2) : null;
                $discountEnds = $hasDiscount ? $now->copy()->addDays(rand(1, 10))->toDateTimeString() : null;

                // Prepare store variant data
                $storeVariantsData[] = [
                    'store_id' => $store->id,
                    'item_variant_id' => $variant->id,
                    'pricing_matrix' => json_encode([
                        'price' => $price,
                        'discount_price' => $discountPrice,
                        'discount_ends_at' => $discountEnds,
                    ]),
                    'active' => true,
                    'manual_status' => 'auto',
                    'created_at' => $now,
                    'updated_at' => $now,
                ];

                // Prepare stock data
                $stocksData[] = [
                    'item_variant_id' => $variant->id,
                    'location_id' => $store->id,
                    'location_type' => Store::class,
                    'quantity' => rand(5, 50),
                    'min_stock_level' => 5,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            // Batch insert store variants (ignore duplicates)
            foreach (array_chunk($storeVariantsData, 100) as $chunk) {
                DB::table('store_variants')->upsert($chunk, ['store_id', 'item_variant_id'], ['pricing_matrix', 'active', 'manual_status', 'updated_at']);
            }

            // Batch insert stocks
            foreach (array_chunk($stocksData, 100) as $chunk) {
                DB::table('item_stocks')->upsert($chunk, ['item_variant_id', 'location_id', 'location_type'], ['quantity', 'min_stock_level', 'updated_at']);
            }

            // Optional seller/customer prices – run only for small subsets to avoid explosion
            if ($createSellerPrices && $sellers->isNotEmpty()) {
                $sellerPriceData = [];
                $storeVariantsForStore = StoreVariant::where('store_id', $store->id)->get();
                foreach ($storeVariantsForStore as $sv) {
                    foreach ($sellers as $seller) {
                        $sellerPriceData[] = [
                            'store_variant_id' => $sv->id,
                            'seller_id' => $seller->id,
                            'pricing_matrix' => json_encode(['price' => round($sv->pricing_matrix['price'] * 0.95, 2)]),
                            'active' => true,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }
                }
                // Insert in chunks
                foreach (array_chunk($sellerPriceData, 200) as $chunk) {
                    DB::table('store_variants_seller_prices')->upsert($chunk, ['store_variant_id', 'seller_id'], ['pricing_matrix', 'active', 'updated_at']);
                }
            }

            if ($createCustomerPrices && $customers->isNotEmpty()) {
                $customerPriceData = [];
                $storeVariantsForStore = StoreVariant::where('store_id', $store->id)->get();
                foreach ($storeVariantsForStore as $sv) {
                    foreach ($customers as $customer) {
                        $customerPriceData[] = [
                            'store_variant_id' => $sv->id,
                            'customer_id' => $customer->id,
                            'pricing_matrix' => json_encode(['price' => round($sv->pricing_matrix['price'] * 0.98, 2)]),
                            'active' => true,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }
                }
                foreach (array_chunk($customerPriceData, 200) as $chunk) {
                    DB::table('store_variants_customer_prices')->upsert($chunk, ['store_variant_id', 'customer_id'], ['pricing_matrix', 'active', 'updated_at']);
                }
            }

            // Optional individual prices — one row per store_variant, no user FK needed
            if ($createIndividualPrices) {
                $individualPriceData = [];
                $storeVariantsForStore = StoreVariant::where('store_id', $store->id)->get();
                foreach ($storeVariantsForStore as $sv) {
                    $matrix = $sv->pricing_matrix;
                    $basePrice = is_array($matrix) ? ($matrix['price'] ?? 0) : 0;
                    // Individual price: ~3% below base, no discount expiry
                    $indPrice = round($basePrice * 0.97, 2);
                    $individualPriceData[] = [
                        'store_variant_id' => $sv->id,
                        'pricing_matrix'   => json_encode([
                            'price'            => $indPrice,
                            'discount_price'   => null,
                            'discount_ends_at' => null,
                        ]),
                        'active'     => true,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
                foreach (array_chunk($individualPriceData, 200) as $chunk) {
                    DB::table('store_variants_individual_prices')
                        ->upsert($chunk, ['store_variant_id'], ['pricing_matrix', 'active', 'updated_at']);
                }
                $this->command->info("  └─ Individual prices seeded: " . count($individualPriceData));
            }

            $this->command->info("Finished store {$store->id}: created " . count($storeVariantsData) . " store variants.");
        }
    }

    private function calculateBaseProductRate($variant): float
    {
        $name = $variant->item?->product_name ?? '';
        return match (true) {
            str_contains($name, 'Bic') => 17.00,
            str_contains($name, 'Ring') => 15.00,
            default => 10.00,
        };
    }
}