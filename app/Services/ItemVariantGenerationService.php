<?php

namespace App\Services;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;

class ItemVariantGenerationService
{
    public function sync(Item $item): void
    {
        $item->load([
            'colors',
            'sizes',
            'packagingTypes' => fn($query) => $query->withPivot('quantity'),
            'stores',
            'variants' => fn($query) => $query->withTrashed(),
        ]);

        $colorIds = $item->colors->pluck('id')->all();
        $sizeIds = $item->sizes->pluck('id')->all();
        $packagingTypes = $item->packagingTypes;

        if (empty($colorIds)) {
            $colorIds = [null];
        }

        if (empty($sizeIds)) {
            $sizeIds = [null];
        }

        if ($packagingTypes->isEmpty()) {
            $packagingTypes = collect([(object) ['id' => null, 'pivot' => (object) ['quantity' => 1]]]);
        }

        $validKeys = [];

        foreach ($colorIds as $colorId) {
            foreach ($sizeIds as $sizeId) {
                foreach ($packagingTypes as $packagingType) {
                    $packagingId = $packagingType->id;
                    $packagingQty = (int) ($packagingType->pivot->quantity ?? 1);

                    $validKeys[] = $this->variantKey($colorId, $sizeId, $packagingId);

                    $variant = ItemVariant::withTrashed()->firstOrNew([
                        'item_id' => $item->id,
                        'item_color_id' => $colorId,
                        'item_size_id' => $sizeId,
                        'item_packaging_type_id' => $packagingId,
                    ]);

                    if ($variant->trashed()) {
                        $variant->restore();
                    }

                    $variant->status = $variant->status ?: ($item->status === 'active' ? 'active' : 'inactive');
                    $variant->packaging_total_pieces = max(1, $packagingQty);
                    $variant->save();

                    $this->ensureStoreVariantRecords($item, $variant);
                }
            }
        }

        $item->variants()
            ->get()
            ->reject(fn(ItemVariant $variant) => in_array(
                $this->variantKey($variant->item_color_id, $variant->item_size_id, $variant->item_packaging_type_id),
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
            StoreVariant::firstOrCreate(
                [
                    'store_id' => $storeId,
                    'item_variant_id' => $variant->id,
                ],
                [
                    'active' => $variant->status === 'active',
                    'manual_status' => $variant->status === 'active' ? 'auto' : 'forced',
                    'forced_status' => $variant->status === 'active' ? null : 'inactive',
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
                'active' => $active,
                'manual_status' => $active ? 'auto' : 'forced',
                'forced_status' => $active ? null : 'inactive',
            ]);
        }
    }

    private function variantKey(?int $colorId, ?int $sizeId, ?int $packagingId): string
    {
        return implode(':', [
            $colorId ?? 'null',
            $sizeId ?? 'null',
            $packagingId ?? 'null',
        ]);
    }
}
