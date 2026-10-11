<?php

declare(strict_types=1);

namespace App\Services\Pricing;

use App\Models\Auth\Customer;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * A customer's own prices, one at a time or in bulk, in both directions:
 * one customer across many store items, and one store item for many
 * customers. PriceProvider reads them as the last rung of the ladder.
 *
 * A customer price is only ever for an item of the customer's own store.
 */
class CustomerPriceService
{
    /**
     * Give each customer in $customerIds the same price on one store item.
     *
     * @param  array<int, int>  $customerIds
     * @param  array{price: float|int|string, discount_price?: float|int|string|null, discount_ends_at?: string|null}  $tier
     * @return Collection<int, StoreVariantCustomerPrice>
     */
    public function forManyCustomers(StoreVariant $storeVariant, array $customerIds, array $tier): Collection
    {
        $customers = Customer::query()->whereKey($customerIds)->get();

        $foreign = $customers->filter(fn (Customer $customer): bool => $customer->store_id !== null
            && (int) $customer->store_id !== (int) $storeVariant->store_id);

        if ($customers->count() !== count(array_unique($customerIds)) || $foreign->isNotEmpty()) {
            throw new InvalidArgumentException('Every customer must belong to this item\'s store.');
        }

        return DB::transaction(fn (): Collection => $customers->map(
            fn (Customer $customer): StoreVariantCustomerPrice => $this->put((int) $storeVariant->id, (int) $customer->id, $tier),
        )->values());
    }

    /**
     * Set (or, with a null price, remove) one customer's price on many
     * store items at once.
     *
     * @param  array<int, array{store_variant_id: int, price: float|int|string|null, discount_price?: float|int|string|null, discount_ends_at?: string|null}>  $rows
     * @return array{saved: int, removed: int}
     */
    public function forManyItems(Customer $customer, array $rows): array
    {
        $ids = array_map(fn (array $row): int => (int) $row['store_variant_id'], $rows);
        $valid = StoreVariant::query()->whereKey($ids)->where('store_id', $customer->store_id)->pluck('id')->map(fn ($id): int => (int) $id)->all();

        if (count(array_diff(array_unique($ids), $valid)) > 0) {
            throw new InvalidArgumentException('Every item must be on sale at this customer\'s store.');
        }

        return DB::transaction(function () use ($customer, $rows): array {
            $saved = 0;
            $removed = 0;

            foreach ($rows as $row) {
                if ($row['price'] === null || $row['price'] === '') {
                    $removed += StoreVariantCustomerPrice::query()
                        ->where('store_variant_id', $row['store_variant_id'])
                        ->where('customer_id', $customer->id)
                        ->delete();

                    continue;
                }

                $this->put((int) $row['store_variant_id'], (int) $customer->id, $row);
                $saved++;
            }

            return ['saved' => $saved, 'removed' => $removed];
        });
    }

    /**
     * Every item on sale at the customer's store, with the store's price
     * and the customer's own one where set.
     *
     * @return array<int, array<string, mixed>>
     */
    public function sheet(Customer $customer): array
    {
        $own = StoreVariantCustomerPrice::query()->where('customer_id', $customer->id)->get()->keyBy('store_variant_id');

        return StoreVariant::query()
            ->where('store_id', $customer->store_id)
            ->with([
                'item:id,product_name',
                'itemVariant:id,sku,item_color_id,item_size_id,item_packaging_type_id',
                'itemVariant.itemColor:id,name',
                'itemVariant.itemSize:id,name',
                'itemVariant.itemPackagingType:id,name,quantity',
            ])
            ->get()
            ->map(function (StoreVariant $storeVariant) use ($own): array {
                $matrix = (array) ($storeVariant->pricing_matrix ?? []);
                $base = isset($matrix[0]) && is_array($matrix[0]) ? $matrix[0] : $matrix;
                $mine = $own->get($storeVariant->id);
                $tier = (array) ($mine?->pricing_matrix ?? []);
                $tier = isset($tier[0]) && is_array($tier[0]) ? $tier[0] : $tier;
                $variant = $storeVariant->itemVariant;

                return [
                    'store_variant_id' => (int) $storeVariant->id,
                    'item' => (string) ($storeVariant->item?->product_name ?? 'Item'),
                    'sku' => $variant?->sku,
                    'color' => $variant?->itemColor?->name,
                    'size' => $variant?->itemSize?->name,
                    'packaging' => $variant?->itemPackagingType?->name,
                    'store_price' => isset($base['price']) ? (float) $base['price'] : null,
                    'price' => isset($tier['price']) ? (float) $tier['price'] : null,
                    'discount_price' => isset($tier['discount_price']) ? (float) $tier['discount_price'] : null,
                    'discount_ends_at' => $tier['discount_ends_at'] ?? null,
                ];
            })
            ->sortBy('item')
            ->values()
            ->all();
    }

    /** @param array<string, mixed> $tier */
    private function put(int $storeVariantId, int $customerId, array $tier): StoreVariantCustomerPrice
    {
        return StoreVariantCustomerPrice::query()->updateOrCreate(
            ['store_variant_id' => $storeVariantId, 'customer_id' => $customerId],
            [
                'pricing_matrix' => [
                    'price' => (float) $tier['price'],
                    'discount_price' => isset($tier['discount_price']) && $tier['discount_price'] !== '' ? (float) $tier['discount_price'] : null,
                    'discount_ends_at' => $tier['discount_ends_at'] ?? null,
                ],
                'active' => true,
            ],
        );
    }
}
