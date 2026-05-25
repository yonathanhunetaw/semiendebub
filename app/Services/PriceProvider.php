<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class PriceProvider
{
    /**
     * Get the full price ladder for a store variant
     *
     * @param int $storeVariantId
     * @param int $storeId
     * @param int|null $sellerId
     * @param int|null $customerId
     * @return array
     */
    public static function getPriceLadder(int $storeVariantId, int $storeId, ?int $sellerId = null, ?int $customerId = null): array
    {
        $prices = [];

        $storeVariant = DB::table('store_variants')
            ->where('id', $storeVariantId)
            ->where('store_id', $storeId)
            ->first();

        if (!$storeVariant) {
            return [];
        }

        $matrix = json_decode($storeVariant->pricing_matrix ?? '[]', true);

        if (empty($matrix)) {
            return [];
        }

        // 1️⃣ Base price = first packaging tier (or piece)
        $base = $matrix[0];

        $prices[] = self::formatMatrixPrice('store', $base);

        // 2️⃣ Seller override
        if ($sellerId && Schema::hasTable('store_variants_seller_prices')) {
            $seller = DB::table('store_variants_seller_prices')
                ->where('store_variant_id', $storeVariantId)
                ->where('seller_id', $sellerId)
                ->where('active', true)
                ->first();

            if ($seller) {
                $sellerMatrix = json_decode($seller->pricing_matrix, true);
                $prices[] = self::formatMatrixPrice('seller', $sellerMatrix[0] ?? $base);
            }
        }

        // 3️⃣ Customer override
        if ($customerId && Schema::hasTable('store_variants_customer_prices')) {
            $customer = DB::table('store_variants_customer_prices')
                ->where('store_variant_id', $storeVariantId)
                ->where('customer_id', $customerId)
                ->where('active', true)
                ->first();

            if ($customer) {
                $customerMatrix = json_decode($customer->pricing_matrix, true);
                $prices[] = self::formatMatrixPrice('customer', $customerMatrix[0] ?? $base);
            }
        }

        return $prices;
    }

    /**
     * Get the final price (last applicable layer)
     */
    public static function getFinalPrice(array $priceLadder): ?float
    {
        if (empty($priceLadder))
            return null;

        return end($priceLadder)['final'];
    }

    /**
     * Format price with discount check
     */
    protected static function formatMatrixPrice(string $level, array $row): array
    {
        $now = Carbon::now();

        $final = ($row['discount_price'] ?? null)
            && (!isset($row['discount_ends_at']) || $now->lt($row['discount_ends_at']))
            ? $row['discount_price']
            : $row['price'];

        return [
            'level' => $level,
            'price' => $row['price'],
            'discount_price' => $row['discount_price'] ?? null,
            'discount_ends_at' => $row['discount_ends_at'] ?? null,
            'final' => $final,
        ];
    }
}
