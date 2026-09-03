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

        // 2️⃣ Individual override (Only apply if customer is an individual with a TIN)
        $isIndividual = false;
        if ($customerId) {
            $customerRecord = DB::table('customers')->find($customerId);
            if ($customerRecord && !empty($customerRecord->tin_number)) {
                $isIndividual = true;
            }
        }

        if ($isIndividual && Schema::hasTable('store_variants_individual_prices')) {
            $individual = DB::table('store_variants_individual_prices')
                ->where('store_variant_id', $storeVariantId)
                ->where('active', 1)
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
                ->where('active', 1)
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
                ->where('active', 1)
                ->first();

            if ($customer && !empty($customer->pricing_matrix)) {
                $customerMatrix = json_decode($customer->pricing_matrix, true);
                $prices[] = self::formatMatrixPrice('customer', self::normalizeMatrix($customerMatrix));
            }
        }

        \Illuminate\Support\Facades\Log::debug('PriceProvider::getPriceLadder Result', [
            'store_variant_id' => $storeVariantId,
            'ladder' => $prices
        ]);

        return $prices;
    }

    /**
     * Helper to ensure we always get a valid price array
     */
    protected static function normalizeMatrix(array $matrix): array
    {
        return (isset($matrix[0]) && is_array($matrix[0])) ? $matrix[0] : $matrix;
    }

    public static function getFinalPrice(array $priceLadder): ?float
    {
        if (empty($priceLadder))
            return null;

        $last = end($priceLadder);

        if (is_numeric($last)) {
            return (float) $last;
        }

        if (is_array($last)) {
            return (float) ($last['final'] ?? $last['price'] ?? 0);
        }

        return null;
    }

    public static function getFinalPriceWithTax(array $priceLadder, string $customerType): float
    {
        $basePrice = self::getFinalPrice($priceLadder) ?? 0.00;

        // If it's an individual account (has TIN), add 15% to the final price
        if ($customerType === 'individual') {
            return round($basePrice * 1.15, 2);
        }

        // If it's a business account (no TIN), return standard price without extra markup
        return (float) $basePrice;
    }

    protected static function formatMatrixPrice(string $level, array $row): array
    {
        $now = Carbon::now();

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

    /**
     * Get the starting price (smallest denomination) for a parent item/product.
     */
    public static function getStartingPriceForItem(int $itemId, int $storeId, ?int $sellerId = null, $customer = null): float
    {
        $storeVariants = DB::table('store_variants')
            ->join('item_variants', 'store_variants.item_variant_id', '=', 'item_variants.id')
            ->where('item_variants.item_id', $itemId)
            ->where('store_variants.store_id', $storeId)
            ->select('store_variants.id', 'store_variants.pricing_matrix')
            ->get();

        if ($storeVariants->isEmpty()) {
            return 0.00;
        }

        $smallestVariant = $storeVariants->sortBy(function ($sv) {
            $matrix = json_decode($sv->pricing_matrix, true) ?? [];
            $normalized = self::normalizeMatrix($matrix);
            return $normalized['price'] ?? 999999;
        })->first();

        $customerId = $customer->id ?? null;
        $ladder = self::getPriceLadder($smallestVariant->id, $storeId, $sellerId, $customerId);

        // TIN filled = individual, No TIN = business
        $hasTin = is_object($customer) && !empty($customer->tin_number);
        $customerType = $hasTin ? 'individual' : 'business';
        
        return self::getFinalPriceWithTax($ladder, $customerType);
    }

    /**
     * Get the aggregated pricing info for an entire item based on its variants.
     */
    public static function getItemPriceRange(\App\Models\Item\Item $item, int $storeId, ?int $sellerId = null, $customer = null): array
    {
        $customerId = is_object($customer) ? ($customer->id ?? null) : $customer;
        
        // TIN filled = individual, No TIN = business
        $hasTin = is_object($customer) && !empty($customer->tin_number);
        $customerType = $hasTin ? 'individual' : 'business';

        \Illuminate\Support\Facades\Log::info('PriceProvider::getItemPriceRange Called', [
            'item_id' => $item->id,
            'store_id' => $storeId,
            'seller_id' => $sellerId,
            'customer_id' => $customerId,
            'customer_type' => $customerType
        ]);

        $variantPrices = [];
        $basePrices = [];
        $ladders = [];
        
        foreach ($item->variants as $variant) {
            foreach ($variant->storeVariants as $sv) {
                if ($sv->store_id !== $storeId) continue;
                if (isset($sv->computed_status) && $sv->computed_status !== 'active') continue;
                if (isset($sv->active) && !$sv->active) continue;

                $ladder = self::getPriceLadder($sv->id, $storeId, $sellerId, $customerId);
                if (empty($ladder)) continue;
                
                $finalPrice = self::getFinalPriceWithTax($ladder, $customerType);
                $basePrice = $ladder[0]['final'] ?? $ladder[0]['price'] ?? 0;
                
                $variantPrices[] = $finalPrice;
                $basePrices[] = $basePrice;
                $ladders[] = $ladder;
            }
        }

        if (empty($variantPrices)) {
            $emptyResult = [
                'store_price' => 0,
                'final_price' => 0,
                'discount_ends_at' => null,
                'pricing_matrix' => [],
            ];
            
            return $emptyResult;
        }

        $minFinalPrice = min($variantPrices);
        $minIndex = array_search($minFinalPrice, $variantPrices);
        $bestLadder = $ladders[$minIndex] ?? [];

        // Use raw `price` (not `final`) from the store tier so the frontend can show
        // a strikethrough when the active price is lower than the base store price.
        $storeTier = collect($bestLadder)->firstWhere('level', 'store');
        $rawStorePrice = $storeTier['price'] ?? ($bestLadder[0]['price'] ?? min($basePrices));
        $discountEndsAt = $bestLadder[0]['discount_ends_at'] ?? null;

        return [
            'store_price' => $rawStorePrice,
            'final_price' => $minFinalPrice,
            'discount_ends_at' => $discountEndsAt,
            'pricing_matrix' => $bestLadder,
        ];
    }
}