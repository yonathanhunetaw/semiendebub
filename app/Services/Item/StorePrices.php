<?php

declare(strict_types=1);

namespace App\Services\Item;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantSellerPrice;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The prices that belong to one seller or one customer for an item in a store, saved a variant at a
 * time: the same data and rules as the Stores page's price editor (App\Models\Store\StoreVariantSellerPrice /
 * CustomerPrice, tiers "business" and "individual"), as a service the item setup page can call.
 *
 * A line with no price removes that variant's entry. A seller price belongs to one of the store's own
 * sellers; a customer price to one of the store's own customers, of the type the price is for (a customer
 * with a TIN is an individual, one without a business).
 */
final class StorePrices
{
    /** @param list<array<string, mixed>> $lines {store_variant_id, price, discount_price, discount_ends_at} */
    public function saveSeller(Store $store, Item $item, User $seller, string $type, array $lines): int
    {
        if ((int) $seller->store_id !== (int) $store->id) {
            throw ValidationException::withMessages(['seller_id' => "{$seller->first_name} {$seller->last_name} does not sell in {$store->name}."]);
        }

        return DB::transaction(function () use ($store, $item, $seller, $type, $lines): int {
            $saved = 0;
            foreach ($this->rows($store, $item, $lines) as [$row, $line]) {
                $record = StoreVariantSellerPrice::firstOrNew(['store_variant_id' => $row->id, 'seller_id' => $seller->id]);
                $matrix = (array) ($record->pricing_matrix ?? []);
                if (! isset($matrix['business']) && ! isset($matrix['individual']) && $matrix !== []) {
                    $matrix = ['business' => $matrix]; // the older single-tier shape
                }

                if ($this->blank($line['price'] ?? null)) {
                    unset($matrix[$type]);
                    if ($matrix === []) {
                        $record->exists && $record->delete();
                    } elseif ($record->exists) {
                        $record->update(['pricing_matrix' => $matrix]);
                    }

                    continue;
                }

                $matrix[$type] = $this->tier($line);
                $record->pricing_matrix = $matrix;
                $record->active = true;
                $record->save();
                $saved++;
            }

            return $saved;
        });
    }

    public function removeSeller(Store $store, Item $item, User $seller, string $type): void
    {
        DB::transaction(function () use ($store, $item, $seller, $type): void {
            StoreVariantSellerPrice::query()
                ->whereIn('store_variant_id', $this->variantIds($store, $item))
                ->where('seller_id', $seller->id)
                ->get()
                ->each(function (StoreVariantSellerPrice $record) use ($type): void {
                    $matrix = (array) ($record->pricing_matrix ?? []);
                    if (isset($matrix['business']) || isset($matrix['individual'])) {
                        unset($matrix[$type]);
                        $matrix === [] ? $record->delete() : $record->update(['pricing_matrix' => $matrix]);
                    } elseif ($type === 'business') {
                        $record->delete(); // the older single-tier shape was the business price
                    }
                });
        });
    }

    /** @param list<array<string, mixed>> $lines */
    public function saveCustomer(Store $store, Item $item, Customer $customer, array $lines): int
    {
        if ($customer->store_id !== null && (int) $customer->store_id !== (int) $store->id) {
            throw ValidationException::withMessages(['customer_id' => 'This customer belongs to another store.']);
        }

        return DB::transaction(function () use ($store, $item, $customer, $lines): int {
            $saved = 0;
            foreach ($this->rows($store, $item, $lines) as [$row, $line]) {
                if ($this->blank($line['price'] ?? null)) {
                    StoreVariantCustomerPrice::query()->where('store_variant_id', $row->id)->where('customer_id', $customer->id)->delete();

                    continue;
                }
                StoreVariantCustomerPrice::query()->updateOrCreate(
                    ['store_variant_id' => $row->id, 'customer_id' => $customer->id],
                    ['pricing_matrix' => $this->tier($line)],
                );
                $saved++;
            }

            return $saved;
        });
    }

    public function removeCustomer(Store $store, Item $item, Customer $customer): void
    {
        StoreVariantCustomerPrice::query()
            ->whereIn('store_variant_id', $this->variantIds($store, $item))
            ->where('customer_id', $customer->id)
            ->delete();
    }

    /** "individual" for a customer with a TIN, otherwise "business". */
    public function typeOf(Customer $customer): string
    {
        return $customer->tin_number ? 'individual' : 'business';
    }

    /** @return list<int> */
    private function variantIds(Store $store, Item $item): array
    {
        return StoreVariant::query()->where('store_id', $store->id)->where('item_id', $item->id)->pluck('id')->all();
    }

    /**
     * Each line with the store variant it names, which must be this item's in this store.
     *
     * @param  list<array<string, mixed>>  $lines
     * @return list<array{0: StoreVariant, 1: array<string, mixed>}>
     */
    private function rows(Store $store, Item $item, array $lines): array
    {
        $mine = StoreVariant::query()->where('store_id', $store->id)->where('item_id', $item->id)->get()->keyBy('id');
        $out = [];

        foreach ($lines as $line) {
            $row = $mine->get((int) ($line['store_variant_id'] ?? 0));
            if ($row === null) {
                throw ValidationException::withMessages(['variants' => 'A price line does not belong to this item in this store.']);
            }
            $out[] = [$row, $line];
        }

        return $out;
    }

    /** @param array<string, mixed> $line @return array{price: float, discount_price: ?float, discount_ends_at: ?string} */
    private function tier(array $line): array
    {
        $discount = $line['discount_price'] ?? null;

        return [
            'price' => (float) $line['price'],
            'discount_price' => $this->blank($discount) ? null : (float) $discount,
            'discount_ends_at' => $this->blank($discount) ? null : ($line['discount_ends_at'] ?? null),
        ];
    }

    private function blank(mixed $value): bool
    {
        return $value === null || $value === '';
    }
}
