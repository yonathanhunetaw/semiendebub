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

        if (!$storeVariant || empty($storeVariant->pricing_matrix)) {
            return [];
        }

        $matrix = json_decode($storeVariant->pricing_matrix, true);

        // 1️⃣ Normalize: Handle both [0 => ['price' => ...]] and ['price' => ...]
        $base = self::normalizeMatrix($matrix);
        $prices[] = self::formatMatrixPrice('store', $base);

        // 2️⃣ Individual override
        if (Schema::hasTable('store_variants_individual_prices')) {
            $individual = DB::table('store_variants_individual_prices')
                ->where('store_variant_id', $storeVariantId)
                ->where('active', true)
                ->first();

            if ($individual && !empty($individual->pricing_matrix)) {
                $indMatrix = json_decode($individual->pricing_matrix, true);
                $prices[] = self::formatMatrixPrice('individual', self::normalizeMatrix($indMatrix));
            }
        }

        // 3️⃣ Seller override
        if ($sellerId && Schema::hasTable('store_variants_seller_prices')) {
            $seller = DB::table('store_variants_seller_prices')
                ->where('store_variant_id', $storeVariantId)
                ->where('seller_id', $sellerId)
                ->where('active', true)
                ->first();

            if ($seller && !empty($seller->pricing_matrix)) {
                $sellerMatrix = json_decode($seller->pricing_matrix, true);
                $prices[] = self::formatMatrixPrice('seller', self::normalizeMatrix($sellerMatrix));
            }
        }

        // 4️⃣ Customer override
        if ($customerId && Schema::hasTable('store_variants_customer_prices')) {
            $customer = DB::table('store_variants_customer_prices')
                ->where('store_variant_id', $storeVariantId)
                ->where('customer_id', $customerId)
                ->where('active', true)
                ->first();

            if ($customer && !empty($customer->pricing_matrix)) {
                $customerMatrix = json_decode($customer->pricing_matrix, true);
                $prices[] = self::formatMatrixPrice('customer', self::normalizeMatrix($customerMatrix));
            }
        }

        return $prices;
    }

    /**
     * Helper to ensure we always get a valid price array
     */
    protected static function normalizeMatrix(array $matrix): array
    {
        // If it's a list (has index 0), return that. If not, return the matrix itself.
        return (isset($matrix[0]) && is_array($matrix[0])) ? $matrix[0] : $matrix;
    }

    public static function getFinalPrice(array $priceLadder): ?float
    {
        if (empty($priceLadder))
            return null;
        return end($priceLadder)['final'];
    }

    protected static function formatMatrixPrice(string $level, array $row): array
    {
        $now = Carbon::now();

        // Ensure we have 'price' key to avoid errors
        $price = $row['price'] ?? 0.00;
        $discount = $row['discount_price'] ?? null;
        $endsAt = $row['discount_ends_at'] ?? null;

        $final = ($discount && (!$endsAt || $now->lt(Carbon::parse($endsAt))))
            ? $discount
            : $price;

        return [
            'level' => $level,
            'price' => $price,
            'discount_price' => $discount,
            'discount_ends_at' => $endsAt,
            'final' => (float) $final,
        ];
    }

    // Add this method to PriceProvider.php

    public static function getFinalPriceWithTax(array $priceLadder, string $customerType): float
    {
        $basePrice = self::getFinalPrice($priceLadder) ?? 0.00;

        // Only apply 15% VAT for business accounts
        if ($customerType === 'business') {
            return round($basePrice * 1.15, 2);
        }

        return (float) $basePrice;
    }
}