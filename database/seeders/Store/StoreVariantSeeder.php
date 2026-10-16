<?php

namespace Database\Seeders\Store;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use App\Models\Store\StoreVariant;
use App\Models\Store\Store;
use Carbon\Carbon;
use Database\Seeders\Admin\ItemSeeder;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Deploys the catalogue into each store: one `store_variants` row per variant a
 * store carries, plus its prices.
 *
 * It no longer writes `item_stocks`. Stock is the ledger of record and has one
 * owner, Database\Seeders\Inventory\StockLedgerSeeder — this seeder wrote store
 * rows only, in flat random quantities with no idea whether a variant was a
 * carton or a piece, and never touched a shop floor.
 *
 * Coverage is now every variant of every item linked to the store through
 * `item_store`. It used to produce 13 rows for one store out of 1,629 variants
 * across three, so the seller and storefront catalogues were all but empty while
 * the stock ledger held a row for every variant at every store — the exact
 * disagreement that made each role report a different figure.
 *
 * A variant's price is ItemSeeder's piece price × the size's factor × the
 * pieces in its pack, less a bulk discount (8 % for a packet/box/bundle, 15 %
 * for a carton/bag), rounded to what a shop would write on a tag. It used to
 * be a flat 10 birr whatever the item or pack — a carton of 1,000 Bic pens
 * cost 16 birr — because the pack multiplier was read off a relation that
 * never carried it.
 */
class StoreVariantSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $stores = Store::all();
        $now = Carbon::now();

        $piecePrices = (new ItemSeeder())->piecePrices();
        $piecesPerUnit = [];
        foreach (DB::table('item_packaging_type_item')->get() as $row) {
            $piecesPerUnit[(int) $row->item_id][(int) $row->item_packaging_type_id] = max(1, (int) $row->quantity);
        }

        // Same prices and promotions on every run.
        mt_srand(2026);
        
        // Optional: set to true if you also want seller/customer/individual prices (can be very heavy)
        $createSellerPrices = false;
        $createCustomerPrices = false;
        $createIndividualPrices = true; // One override per variant — lightweight

        foreach ($stores as $store) {
            $this->command->info("Processing store: {$store->name} (ID: {$store->id})");

            // Get variants belonging to this store (via item.stores)
            $variants = ItemVariant::whereHas('item.stores', function ($q) use ($store) {
                $q->where('store_id', $store->id);
            })->with(['item:id,file_prefix', 'itemSize:id,name', 'itemPackagingType:id,name'])->get();

            if ($variants->isEmpty()) {
                $this->command->warn("No variants for store {$store->id}, skipping.");
                continue;
            }

            // Pre‑fetch sellers and customers for this store only if needed
            $sellers = $createSellerPrices ? User::where('store_id', $store->id)->where('role', 'seller')->get() : collect();
            $customers = $createCustomerPrices ? Customer::where('store_id', $store->id)->get() : collect();

            $storeVariantsData = [];
            
            foreach ($variants as $variant) {
                $price = $this->priceFor($variant, $piecePrices, $piecesPerUnit);

                // About one listing in seven is on promotion: 5–10 % off for a few days.
                $hasDiscount = mt_rand(1, 7) === 1;
                $discountPrice = $hasDiscount ? $this->tagPrice($price * mt_rand(90, 95) / 100) : null;
                $discountEnds = $hasDiscount ? $now->copy()->addDays(mt_rand(3, 10))->toDateTimeString() : null;

                // Prepare store variant data
                $storeVariantsData[] = [
                    'store_id' => $store->id,
                    'item_id' => $variant->item_id,
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

            }

            // Add the listings a store is missing. Existing rows are left alone,
            // so re-running this on a live database never re-rolls prices an
            // admin set (a fresh database seeds exactly as before).
            foreach (array_chunk($storeVariantsData, 500) as $chunk) {
                DB::table('store_variants')->insertOrIgnore($chunk);
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
                    // Same rule: only listings without an individual price get one.
                    DB::table('store_variants_individual_prices')->insertOrIgnore($chunk);
                }
                $this->command->info("  └─ Individual prices seeded: " . count($individualPriceData));
            }

            // Counted back from the table, not from the array we meant to
            // write: the figure that mattered was always how many rows exist.
            $deployed = DB::table('store_variants')->where('store_id', $store->id)->count();

            $this->command->info(
                "Finished store {$store->id}: {$deployed} of " . count($storeVariantsData) . ' variants deployed.'
            );
        }
    }

    /**
     * @param  array<string, array{piece: float, sizes?: array<string, float>}>  $piecePrices
     * @param  array<int, array<int, int>>  $piecesPerUnit
     */
    private function priceFor(ItemVariant $variant, array $piecePrices, array $piecesPerUnit): float
    {
        $price = $piecePrices[$variant->item?->file_prefix] ?? ['piece' => 10.0];
        $sizeFactor = $price['sizes'][$variant->itemSize?->name] ?? 1.0;
        $pieces = $piecesPerUnit[$variant->item_id][$variant->item_packaging_type_id] ?? 1;

        $bulkDiscount = match ($variant->itemPackagingType?->name) {
            'Carton', 'Bag' => 0.85,
            'Packet', 'Box', 'Bundle', 'Doz' => 0.92,
            default => 1.0,
        };

        return $this->tagPrice($price['piece'] * $sizeFactor * $pieces * ($pieces > 1 ? $bulkDiscount : 1.0));
    }

    /** Round to what goes on a price tag: 0.50 under 10 birr, 1 under 100, 5 under 1,000, then 10. */
    private function tagPrice(float $price): float
    {
        $step = match (true) {
            $price < 10 => 0.5,
            $price < 100 => 1.0,
            $price < 1000 => 5.0,
            default => 10.0,
        };

        return max($step, round($price / $step) * $step);
    }
}
