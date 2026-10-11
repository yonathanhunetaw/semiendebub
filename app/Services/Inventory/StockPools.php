<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Inventory\StockReservation;
use App\Models\Store\StoreVariant;

/**
 * Stock set aside for Business customers, per store item.
 *
 * A manager sets how many units of an item at a store are kept for Business
 * customers (store_variants.business_pool); the rest of the store's stock is
 * the Individual (VAT) pool. A Business sale may only use what is left of
 * the set-aside, and an Individual sale never touches it. With no figure set
 * there is one shared count, as before.
 *
 * Holds remember their pool (stock_reservations.pool), so the set-aside is
 * counted net of Business orders still waiting; picking a Business order
 * uses its share of the set-aside up (StockService::pick).
 *
 * The customer rule is the pricing one (PriceProvider): a walk-in or a
 * customer with a TIN is Individual; a customer without one is Business.
 */
final class StockPools
{
    public const INDIVIDUAL = 'individual';

    public const BUSINESS = 'business';

    /** Which pool a customer draws on. */
    public static function forCustomer(mixed $customer): string
    {
        return $customer === null || ! empty($customer->tin_number) ? self::INDIVIDUAL : self::BUSINESS;
    }

    /** The set-aside for an item at a store, or null when there is no split. */
    public function setAside(int $itemVariantId, int $storeId): ?int
    {
        $pool = StoreVariant::query()
            ->where('store_id', $storeId)
            ->where('item_variant_id', $itemVariantId)
            ->value('business_pool');

        return $pool === null ? null : (int) $pool;
    }

    /** What is left of the set-aside: the figure less Business holds still open. */
    public function businessLeft(int $itemVariantId, int $storeId): ?int
    {
        $setAside = $this->setAside($itemVariantId, $storeId);

        if ($setAside === null) {
            return null;
        }

        $held = (int) StockReservation::query()
            ->open()
            ->where('item_variant_id', $itemVariantId)
            ->where('store_id', $storeId)
            ->whereNull('stock_location_id')
            ->where('pool', self::BUSINESS)
            ->sum('quantity');

        return max(0, $setAside - $held);
    }

    /**
     * Of $free units at the store (on hand less every open hold), how many
     * $pool may take.
     */
    public function share(int $itemVariantId, int $storeId, int $free, ?string $pool): int
    {
        $left = $pool === null ? null : $this->businessLeft($itemVariantId, $storeId);

        if ($left === null) {
            return $free;
        }

        return $pool === self::BUSINESS ? max(0, min($free, $left)) : max(0, $free - $left);
    }

    /**
     * A Business order was picked: its units leave the set-aside with the
     * stock itself.
     */
    public function consume(int $itemVariantId, int $storeId, int $quantity): void
    {
        StoreVariant::query()
            ->where('store_id', $storeId)
            ->where('item_variant_id', $itemVariantId)
            ->whereNotNull('business_pool')
            ->get()
            ->each(fn (StoreVariant $row) => $row->update(['business_pool' => max(0, (int) $row->business_pool - $quantity)]));
    }

    /**
     * The two pools as screens show them, or null when there is no split.
     *
     * @return array{business: int, individual: int, set_aside: int}|null
     */
    public function present(int $itemVariantId, int $storeId, int $free): ?array
    {
        $left = $this->businessLeft($itemVariantId, $storeId);

        if ($left === null) {
            return null;
        }

        return [
            'set_aside' => (int) $this->setAside($itemVariantId, $storeId),
            'business' => max(0, min($free, $left)),
            'individual' => max(0, $free - $left),
        ];
    }
}
