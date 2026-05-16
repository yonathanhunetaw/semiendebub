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
            'stores',
            'variants' => fn($query) => $query->withTrashed(),
        ]);

        $colorIds = $item->colors->pluck('id')->all();
        $sizeIds = $item->sizes->pluck('id')->all();

        if (empty($colorIds)) {
            $colorIds = [null];
        }

        if (empty($sizeIds)) {
            $sizeIds = [null];
        }

        $validKeys = [];

        // ─── Loop strictly over physical characteristics ─────────────────────
        foreach ($colorIds as $colorId) {
            foreach ($sizeIds as $sizeId) {
                
                // Key format shifts to just "color:size"
                $validKeys[] = $this->variantKey($colorId, $sizeId);

                $variant = ItemVariant::withTrashed()->firstOrNew([
                    'item_id'       => $item->id,
                    'item_color_id' => $colorId,
                    'item_size_id'  => $sizeId,
                ]);

                if ($variant->trashed()) {
                    $variant->restore();
                }

                // Default basic properties if new
                $variant->status = $variant->status ?: ($item->status === 'active' ? 'active' : 'inactive');
                $variant->save();

                $this->ensureStoreVariantRecords($item, $variant);
            }
        }

        // ─── Clean up obsolete variants ──────────────────────────────────────
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
            StoreVariant::firstOrCreate(
                [
                    'store_id'        => $storeId,
                    'item_variant_id' => $variant->id,
                ],
                [
                    'item_id'       => $item->id, // Added verified required fix
                    'active'        => $variant->status === 'active',
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
                'active'        => $active,
                'manual_status' => $active ? 'auto' : 'forced',
                'forced_status' => $active ? null : 'inactive',
            ]);
        }
    }

    private function variantKey(?int $colorId, ?int $sizeId): string
    {
        return implode(':', [
            $colorId ?? 'null',
            $sizeId  ?? 'null',
        ]);
    }
}