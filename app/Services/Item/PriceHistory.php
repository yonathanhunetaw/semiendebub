<?php

declare(strict_types=1);

namespace App\Services\Item;

use App\Models\Store\PriceChange;
use App\Models\Store\StoreVariant;
use App\Services\Workforce\LocalTime;

/**
 * The catalogue's price history (price_changes): what changed, when, by whom,
 * and what a store price was on a given day. Sale lines keep their own price
 * at checkout, so this is for "what were we charging then?", not for receipts.
 */
final class PriceHistory
{
    /**
     * The newest price changes of an item's variants, in the given stores.
     *
     * @param  array<int, int>|null  $storeIds  null = every store
     * @return list<array<string, mixed>>
     */
    public function forItem(int $itemId, ?array $storeIds, int $limit = 30): array
    {
        return PriceChange::query()
            ->with(['changer:id,first_name,last_name', 'storeVariant.store:id,name', 'storeVariant.itemVariant.itemColor', 'storeVariant.itemVariant.itemSize', 'storeVariant.itemVariant.itemPackagingType'])
            ->whereIn('store_variant_id', StoreVariant::query()->where('item_id', $itemId)->select('id'))
            ->when($storeIds !== null, fn ($q) => $q->whereIn('store_id', $storeIds ?: [0]))
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(function (PriceChange $change): array {
                $variant = $change->storeVariant?->itemVariant;

                return [
                    'id' => (int) $change->id,
                    'kind' => (string) $change->kind,
                    'store' => $change->storeVariant?->store?->name,
                    'variant' => collect([$variant?->itemColor?->name, $variant?->itemSize?->name, $variant?->itemPackagingType?->name])->filter()->join(' / ') ?: ($variant?->sku ?? null),
                    'old_price' => $change->old_price !== null ? (float) $change->old_price : null,
                    'new_price' => $change->new_price !== null ? (float) $change->new_price : null,
                    'by' => $change->changer ? trim($change->changer->first_name.' '.$change->changer->last_name) : null,
                    'at' => $change->created_at?->toIso8601String(),
                ];
            })
            ->values()
            ->all();
    }

    /**
     * A store variant's own store price at the end of a shop date, from its
     * history; null when nothing was recorded by then.
     */
    public function storePriceOn(int $storeVariantId, string $date): ?float
    {
        $change = PriceChange::query()
            ->where('store_variant_id', $storeVariantId)
            ->where('kind', PriceChange::KIND_STORE)
            ->where('created_at', '<', LocalTime::startOf(LocalTime::day($date)->addDay()))
            ->latest('id')
            ->first();

        return $change?->new_price !== null ? (float) $change->new_price : null;
    }
}
