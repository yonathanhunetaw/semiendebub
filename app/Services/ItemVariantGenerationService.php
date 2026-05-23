<?php

namespace App\Services;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Support\Facades\DB;

class ItemVariantGenerationService
{
    public function sync(Item $item, array $uploadedImages = []): void
    {
        $item->load([
            'colors',
            'sizes',
            'packagingTypes',
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

        \Illuminate\Support\Facades\Log::info('Variant Generation Stats:', [
            'colors' => $item->colors->pluck('id')->toArray(),
            'sizes' => $item->sizes->pluck('id')->toArray(),
            'count_colors' => $item->colors->count(),
            'count_sizes' => $item->sizes->count()
        ]);
        // ─── 🎯 TWO-TIER PHYSICAL COMBINATION MATRIX LOOP (Color x Size) ─────
        foreach ($colorIds as $colorId) {
            foreach ($sizeIds as $sizeId) {

                // Trace string tracking compound key
                $validKeys[] = $this->variantKey($colorId, $sizeId);

                $variant = ItemVariant::withTrashed()->firstOrNew([
                    'item_id' => $item->id,
                    'item_color_id' => $colorId,
                    'item_size_id' => $sizeId,
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
                // Sync the main variant images column directly
                if (!empty($uploadedImages)) {
                    $variant->images = $uploadedImages;
                }
                $variant->save();

                $this->ensureStoreVariantRecords($item, $variant, $uploadedImages);
            }
        }

        $item->variants()
            ->get()
            ->reject(fn(ItemVariant $variant) => in_array(
                $this->variantKey($variant->item_color_id, $variant->item_size_id),
                $validKeys,
                true
            ))
            ->each(function (ItemVariant $variant) {
                $variant->delete();
            });
    }

    public function ensureStoreVariantRecords(Item $item, ItemVariant $variant, array $uploadedImages = []): void
    {
        $storeIds = $item->stores()->pluck('stores.id');

        if ($storeIds->isEmpty()) {
            $storeIds = Store::query()->pluck('id');
        }

        foreach ($storeIds as $storeId) {

            // ─── 1. STANDARD STORE PRICING MATRIX ───────────────────────────
            $storeMatrix = [];
            foreach ($item->packagingTypes as $index => $packType) {
                $multiplier = (int) ($packType->pivot->quantity ?? 1);

                // Determine baseline retail prices per item brand rules
                $baseRetailCost = 10.00;
                if (str_contains($item->product_name, 'Bic')) {
                    $baseRetailCost = 17.00;
                } elseif (str_contains($item->product_name, 'Ring')) {
                    $baseRetailCost = 15.00;
                }

                $calculatedPrice = $baseRetailCost * $multiplier;

                // Bulk wholesale discount scale mappings
                if ($multiplier >= 1000) {
                    $calculatedPrice *= 0.75; // 25% Industrial Master bulk discount
                } elseif ($multiplier >= 100) {
                    $calculatedPrice *= 0.85; // 15% Standard Carton drop
                } elseif ($multiplier >= 10) {
                    $calculatedPrice *= 0.92; // 8% Small bundle box drop
                }

                // Map to the real uploaded file path or fallback to a placeholder
                $packageMinioKey = $uploadedImages[$index] ?? ($uploadedImages[0] ?? 'uploads/items/placeholder.jpg');

                $storeMatrix[] = [
                    'packaging_type_id' => $packType->id,
                    'unit_name' => $packType->name,
                    'multiplier' => $multiplier,
                    'price' => round($calculatedPrice, 2),
                    'discount_price' => null,
                    'discount_ends_at' => null,
                    'image' => $packageMinioKey,
                ];
            }

            $storeVariant = StoreVariant::updateOrCreate(
                [
                    'store_id' => $storeId,
                    'item_variant_id' => $variant->id,
                ],
                [
                    'active' => $variant->status === 'active',
                    'manual_status' => $variant->status === 'active' ? 'auto' : 'forced',
                    'forced_status' => $variant->status === 'active' ? null : 'inactive',
                    'pricing_matrix' => $storeMatrix,
                ]
            );

            // ─── 2. SELLER / AGENT MATRIX TIER ─────────────────────────────
            $sellerMatrix = [];
            foreach ($storeMatrix as $row) {
                $sellerMatrix[] = array_merge($row, [
                    'price' => round($row['price'] * 0.85, 2) // Additional 15% wholesale agent markdown
                ]);
            }

            DB::table('store_variants_seller_prices')->updateOrInsert(
                ['store_variant_id' => $storeVariant->id, 'seller_id' => 1],
                ['pricing_matrix' => json_encode($sellerMatrix), 'active' => true, 'updated_at' => now()]
            );

            // ─── 3. VIP CUSTOMER CONTRACT MATRIX TIER ──────────────────────
            $customerMatrix = [];
            foreach ($storeMatrix as $row) {
                $customerMatrix[] = array_merge($row, [
                    'price' => round($row['price'] * 0.95, 2) // 5% Standard loyalty contract markdown
                ]);
            }

            DB::table('store_variants_customer_prices')->updateOrInsert(
                ['store_variant_id' => $storeVariant->id, 'customer_id' => 1],
                ['pricing_matrix' => json_encode($customerMatrix), 'active' => true, 'updated_at' => now()]
            );
        }
    }

    private function variantKey(?int $colorId, ?int $sizeId): string
    {
        return implode(':', [
            $colorId ?? 'null',
            $sizeId ?? 'null',
        ]);
    }
}