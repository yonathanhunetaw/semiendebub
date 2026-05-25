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
        $item->load(['colors', 'sizes', 'packagingTypes']);

        $colorIds = $item->colors->isNotEmpty() ? $item->colors->pluck('id')->toArray() : [null];
        $sizeIds = $item->sizes->isNotEmpty() ? $item->sizes->pluck('id')->toArray() : [null];
        $packIds = $item->packagingTypes->isNotEmpty() ? $item->packagingTypes->pluck('id')->toArray() : [null];

        $validVariantIds = [];
        $variantIndex = 1;

        foreach ($colorIds as $colorId) {
            foreach ($sizeIds as $sizeId) {
                foreach ($packIds as $packId) {

                    // 1. Find or Create
                    $variant = ItemVariant::withTrashed()->firstOrNew([
                        'item_id' => $item->id,
                        'item_color_id' => $colorId,
                        'item_size_id' => $sizeId,
                        'item_packaging_type_id' => $packId,
                    ]);

                    if ($variant->trashed()) {
                        $variant->restore();
                    }

                    // 2. Set Images (Using the current variantIndex)
                    $variantSpecificImages = [];
                    for ($i = 1; $i <= 5; $i++) {
                        $variantSpecificImages[] = "uploads/items/{$item->id}/{$item->file_prefix}_v{$variantIndex}_{$i}.jpg";
                    }

                    $variant->images = $variantSpecificImages;
                    $variant->status = $item->status;

                    // Construct a robust SKU including the packaging ID
                    if (empty($variant->sku)) {
                        $variant->sku = sprintf(
                            'DUKA-I%d-C%s-S%s-P%s',
                            $item->id,
                            $colorId ?? '0',
                            $sizeId ?? '0',
                            $packId ?? '0'
                        );
                    }

                    $variant->save();

                    // Track this ID so we don't delete it later
                    $validVariantIds[] = $variant->id;

                    // 3. Process Pricing/Stores
                    $this->ensureStoreVariantRecords($item, $variant, $variantSpecificImages);

                    $variantIndex++;
                }
            }
        }

        // 4. Cleanup: Delete variants that are no longer part of this item's matrix
        $item->variants()->whereNotIn('id', $validVariantIds)->delete();
    }

    public function ensureStoreVariantRecords(Item $item, ItemVariant $variant, array $uploadedImages = []): void
    {
        $storeIds = $item->stores()->pluck('stores.id');
        if ($storeIds->isEmpty()) {
            $storeIds = Store::query()->pluck('id');
        }

        $packType = $variant->itemPackagingType;
        if (!$packType)
            return;

        $multiplier = (int) ($packType->pivot->quantity ?? 1);
        $typeName = strtolower($packType->name);

        $unitPrice = 10.00;
        if (str_contains($item->product_name, 'Bic')) {
            $unitPrice = match ($typeName) {
                'packet' => 16.70,
                'cartoon' => 16.60,
                default => 17.00,
            };
        } elseif (str_contains($item->product_name, 'Ring')) {
            $unitPrice = 15.00;
        }

        $totalPrice = $unitPrice * $multiplier;
        $firstStoreId = $storeIds->first();

        // 1. Create/Update the StoreVariant FIRST so we have an ID
        $storeVariant = StoreVariant::updateOrCreate(
            [
                'store_id' => $firstStoreId,
                'item_variant_id' => $variant->id,
            ],
            [
                'active' => $variant->status === 'active',
                'manual_status' => $variant->status === 'active' ? 'auto' : 'forced',
                'forced_status' => $variant->status === 'active' ? null : 'inactive',
                'pricing_matrix' => [
                    'price' => round($totalPrice, 2),
                    'discount_price' => null,
                    'discount_ends_at' => null,
                ],
            ]
        );

        // 2. Now use $storeVariant->id for the prices
        DB::table('store_variants_seller_prices')->updateOrInsert(
            ['store_variant_id' => $storeVariant->id, 'seller_id' => 1],
            [
                'pricing_matrix' => json_encode(['price' => round($totalPrice * 0.85, 2), 'active' => true]),
                'active' => true,
                'updated_at' => now()
            ]
        );

        DB::table('store_variants_customer_prices')->updateOrInsert(
            ['store_variant_id' => $storeVariant->id, 'customer_id' => 1],
            [
                'pricing_matrix' => json_encode(['price' => round($totalPrice * 0.95, 2), 'active' => true]),
                'active' => true,
                'updated_at' => now()
            ]
        );
    }

    private function variantKey(?int $colorId, ?int $sizeId): string
    {
        return implode(':', [
            $colorId ?? 'null',
            $sizeId ?? 'null',
        ]);
    }
}