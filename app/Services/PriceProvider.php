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
        // Applies to:
        // - Carts without a customer (walk-in guest retail customer = individual)
        // - Customers with a TIN (registered individual customer)
        // Business customers (registered customer without TIN) do NOT get individual prices.
        $isIndividual = false;
        if ($customerId === null) {
            $isIndividual = true;
        } else {
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
                $sellerTier = self::selectSellerTier($sellerMatrix, $isIndividual);
                if ($sellerTier !== null) {
                    $prices[] = self::formatMatrixPrice('seller', self::normalizeMatrix($sellerTier));
                }
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

    /**
     * Seller overrides can carry distinct business and individual tiers while
     * remaining compatible with the legacy single-tier pricing matrix.
     */
    protected static function selectSellerTier(array $matrix, bool $isIndividual): ?array
    {
        $tier = $isIndividual ? 'individual' : 'business';

        if (isset($matrix['business']) || isset($matrix['individual'])) {
            return isset($matrix[$tier]) && is_array($matrix[$tier]) ? $matrix[$tier] : null;
        }

        return $matrix;
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
        return (float) (self::getFinalPrice($priceLadder) ?? 0.00);
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
            ->where('store_variants.active', 1)
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

        // Cart without customer = individual walk-in; Customer with TIN = individual; Customer without TIN = business
        if ($customer === null) {
            $customerType = 'individual';
        } else {
            $hasTin = is_object($customer) && !empty($customer->tin_number);
            $customerType = $hasTin ? 'individual' : 'business';
        }
        
        return self::getFinalPriceWithTax($ladder, $customerType);
    }

    /**
     * Get the aggregated pricing info for an entire item based on its variants.
     */
    public static function getItemPriceRange(\App\Models\Item\Item $item, int $storeId, ?int $sellerId = null, $customer = null): array
    {
        $customerId = is_object($customer) ? ($customer->id ?? null) : $customer;
        
        // Cart without customer = individual walk-in; Customer with TIN = individual; Customer without TIN = business
        if ($customer === null) {
            $customerType = 'individual';
        } else {
            $hasTin = is_object($customer) && !empty($customer->tin_number);
            $customerType = $hasTin ? 'individual' : 'business';
        }

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
                $basePrice = $ladder[0]['price'] ?? 0;
                
                $variantPrices[] = $finalPrice;
                $basePrices[] = $basePrice;
                $ladders[] = $ladder;
            }
        }

        if (empty($variantPrices)) {
            return [
                'store_price' => 0,
                'final_price' => 0,
                'discount_ends_at' => null,
                'pricing_matrix' => [],
                'customer_type' => $customerType,
                'vat_applied' => false,
            ];
        }

        $minBasePrice = min($basePrices);
        $minIndex = array_search($minBasePrice, $basePrices);
        $minFinalPrice = $variantPrices[$minIndex];
        $bestLadder = $ladders[$minIndex] ?? [];

        $storeTier = collect($bestLadder)->firstWhere('level', 'store');
        $displayTier = $customerType === 'individual'
            ? (collect($bestLadder)->firstWhere('level', 'individual') ?? $storeTier)
            : $storeTier;
        $rawStorePrice = $displayTier['price'] ?? ($bestLadder[0]['price'] ?? min($basePrices));
        $discountEndsAt = $displayTier['discount_ends_at'] ?? ($bestLadder[0]['discount_ends_at'] ?? null);

        // Determine which tier was actually used for the final price
        $resolvedTier = end($bestLadder);
        $resolvedLevel = $resolvedTier['level'] ?? 'store';
        $vatApplied = false;

        // 📊 Log the full price resolution path
        \Illuminate\Support\Facades\Log::info('PriceProvider::getItemPriceRange Result', [
            'item_id' => $item->id,
            'item_name' => $item->product_name ?? null,
            'customer_id' => $customerId,
            'customer_type' => $customerType,
            'vat_applied' => $vatApplied,
            'resolved_tier' => $resolvedLevel,
            'store_price' => (float) $rawStorePrice,
            'final_price' => $minFinalPrice,
            'ladder_path' => collect($bestLadder)->map(fn($t) => $t['level'] . ':' . $t['final'])->implode(' → '),
        ]);

        return [
            'store_price' => (float) $rawStorePrice,
            'final_price' => $minFinalPrice,
            'discount_ends_at' => $discountEndsAt,
            'pricing_matrix' => $bestLadder,
            'customer_type' => $customerType,
            'vat_applied' => $vatApplied,
        ];
    }
}
