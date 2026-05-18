<?php

namespace App\Services;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Support\Facades\DB;

class ItemVariantGenerationService
{
    public function sync(Item $item): void
    {
        $item->load([
            'colors',
            'sizes',
            'packagingTypes', // 🎯 Load packaging contexts for the JSON matrix layer
            'stores',
            'variants' => fn($query) => $query->withTrashed(),
        ]);

        $colorIds = $item->colors->pluck('id')->all();
        $sizeIds = $item->sizes->pluck('id')->all();

        // Fallbacks for items without distinct attributes to keep the matrix intact
        if (empty($colorIds)) {
            $colorIds = [null];
        }

        if (empty($sizeIds)) {
            $sizeIds = [null];
        }

        $validKeys = [];

        // ─── 🎯 TWO-TIER PHYSICAL COMBINATION MATRIX LOOP (Color x Size) ─────
        foreach ($colorIds as $colorId) {
            foreach ($sizeIds as $sizeId) {
                
                // Trace string tracking compound key
                $validKeys[] = $this->variantKey($colorId, $sizeId);

                $variant = ItemVariant::withTrashed()->firstOrNew([
                    'item_id'       => $item->id,
                    'item_color_id' => $colorId,
                    'item_size_id'  => $sizeId,
                ]);

                if ($variant->trashed()) {
                    $variant->restore();
                }

                // 🎯 AUTOMATED STRUCTURAL SKU GENERATION
                // Output matches clean pattern: DUKA-I1-C2-S1
                if (empty($variant->sku)) {
                    $variant->sku = sprintf(
                        'DUKA-I%d-C%s-S%s',
                        $item->id,
                        $colorId ?? '0',
                        $sizeId ?? '0'
                    );
                }

                // Default basic properties if brand new
                $variant->status = $variant->status ?: ($item->status === 'active' ? 'active' : 'inactive');
                $variant->save();

                // Process the role-based JSON pricing arrays for this physical unit
                $this->ensureStoreVariantRecords($item, $variant);
            }
        }

        // ─── Clean up obsolete physical variants ─────────────────────────────
        $item->variants()
            ->get()
            ->reject(fn(ItemVariant $variant) => in_array(
                $this->variantKey($variant->item_color_id, $variant->item_size_id),
                $validKeys,
                true
            ))
            ->each(function (ItemVariant $variant) {
                $this->applyAvailabilityToStores($variant, false);
                $variant->delete();
            });
    }

    public function ensureStoreVariantRecords(Item $item, ItemVariant $variant): void
    {
        $storeIds = $item->stores()->pluck('stores.id');

        if ($storeIds->isEmpty()) {
            $storeIds = Store::query()->pluck('id');
        }

        foreach ($storeIds as $storeId) {
            
            // ─── 1. BUILD BASELINE STORE PRICING MATRIX ─────────────────────
            $storeMatrix = [];
            foreach ($item->packagingTypes as $index => $packType) {
                $multiplier = (int) ($packType->pivot->quantity ?? 1);
                
                $baseRetailCost = 100.00; // Standard baseline unit cost
                $calculatedPrice = $baseRetailCost * $multiplier;

                // Apply bulk wholesale markdown curves
                if ($multiplier >= 120) {
                    $calculatedPrice *= 0.80; // 20% Carton discount
                } elseif ($multiplier >= 10) {
                    $calculatedPrice *= 0.90; // 10% Packet discount
                }

                // Match up your specific seed images to their respective packaging tier keys
                $targetFileNumber = ($index % 5) + 1;
                $specificPackageFileName = "{$item->file_prefix}_{$targetFileNumber}.jpg";
                $packageMinioKey = "uploads/items/{$item->id}/{$specificPackageFileName}";

                $storeMatrix[] = [
                    'packaging_type_id' => $packType->id,
                    'unit_name'         => $packType->name,
                    'multiplier'        => $multiplier,
                    'price'             => round($calculatedPrice, 2),
                    'discount_price'    => null, 
                    'discount_ends_at'  => null,
                    'image'             => $packageMinioKey,
                ];
            }

            // Save standard baseline map
            $storeVariant = StoreVariant::updateOrCreate(
                [
                    'store_id'        => $storeId,
                    'item_variant_id' => $variant->id,
                ],
                [
                    'active'         => $variant->status === 'active',
                    'manual_status'  => $variant->status === 'active' ? 'auto' : 'forced',
                    'forced_status'  => $variant->status === 'active' ? null : 'inactive',
                    'pricing_matrix' => $storeMatrix, 
                ]
            );

            // ─── 2. BUILD CUSTOM AGENT/SELLER PRICING MATRIX ─────────────────
            $sellerMatrix = [];
            foreach ($storeMatrix as $row) {
                // Sellers get an additional 15% wholesale drop across all lines
                $sellerDiscountPrice = $row['price'] * 0.85; 
                
                $sellerMatrix[] = array_merge($row, [
                    'price' => round($sellerDiscountPrice, 2)
                ]);
            }

            $defaultSellerId = 1; // Assuming a standard seeder reference user exists
            DB::table('store_variants_seller_prices')->updateOrInsert(
                [
                    'store_variant_id' => $storeVariant->id, 
                    'seller_id'        => $defaultSellerId
                ],
                [
                    'pricing_matrix' => json_encode($sellerMatrix), 
                    'active'         => true, 
                    'updated_at'     => now()
                ]
            );

            // ─── 3. BUILD CUSTOM VIP CUSTOMER CONTRACT MATRIX ───────────────
            $customerMatrix = [];
            foreach ($storeMatrix as $row) {
                // VIP customers lock in an alternative 5% loyalty contract markdown
                $customerContractPrice = $row['price'] * 0.95; 
                
                $customerMatrix[] = array_merge($row, [
                    'price' => round($customerContractPrice, 2)
                ]);
            }

            $defaultCustomerId = 1; // Assuming a standard customer record exists
            DB::table('store_variants_customer_prices')->updateOrInsert(
                [
                    'store_variant_id' => $storeVariant->id, 
                    'customer_id'      => $defaultCustomerId
                ],
                [
                    'pricing_matrix' => json_encode($customerMatrix), 
                    'active'         => true, 
                    'updated_at'     => now()
                ]
            );
        }
    }

    public function applyAvailabilityToStores(ItemVariant $variant, bool $active): void
    {
        $variant->loadMissing('item.stores', 'storeVariants');

        $this->ensureStoreVariantRecords($variant->item, $variant);
        $variant->load('storeVariants');

        foreach ($variant->storeVariants as $storeVariant) {
            $storeVariant->update([
                'active'        => $active,
                'manual_status' => $active ? 'auto' : 'forced',
                'forced_status' => $active ? null : 'inactive',
            ]);
        }
    }

    /**
     * Helper trace builder key method restored strictly for physical mapping tracking.
     */
    private function variantKey(?int $colorId, ?int $sizeId): string
    {
        return implode(':', [
            $colorId ?? 'null',
            $sizeId  ?? 'null',
        ]);
    }
}