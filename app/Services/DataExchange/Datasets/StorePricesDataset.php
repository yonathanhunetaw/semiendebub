<?php

declare(strict_types=1);

namespace App\Services\DataExchange\Datasets;

use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\DataExchange\Dataset;
use App\Services\DataExchange\ImportPlan;
use App\Services\Item\StorePrices;
use App\Services\Shared\CsvTable;

/**
 * The store's own price of each variant, the way the item setup page's Prices part sets it. This is the go-live
 * step: a price above zero puts a deployed variant on sale, a price of zero takes it off, and one an admin forced
 * off stays off. The check says how many variants go on sale or off before anything is saved.
 *
 *   store, sku        which store variant (it must already be in the store: put the item there first)
 *   price             the price; empty keeps the current one
 *   discount_price    empty keeps it, CLEAR removes it; needs discount_ends_at and may not exceed the price
 *   discount_ends_at  a date like 2026-12-31 (CLEAR removes it with the discount)
 *   individual_price  the price for individuals; empty keeps it, CLEAR removes it
 *   business_pool     units kept for Business customers; empty keeps it, CLEAR removes the split
 *   on_sale           only to read: yes when the variant is on sale now. The switch itself stays on the item page.
 */
final class StorePricesDataset extends Dataset
{
    public function __construct(private readonly StorePrices $prices)
    {
    }

    public function key(): string
    {
        return 'store_prices';
    }

    public function label(): string
    {
        return 'Store prices';
    }

    public function group(): string
    {
        return 'Store';
    }

    public function description(): string
    {
        return 'The price of each variant in each store. A price above zero puts a deployed variant on sale, so this is the go-live step.';
    }

    public function columns(): array
    {
        return ['store', 'sku', 'item', 'price', 'discount_price', 'discount_ends_at', 'individual_price', 'business_pool', 'on_sale'];
    }

    public function required(): array
    {
        return ['store', 'sku'];
    }

    public function example(): array
    {
        return ['Main Store', 'DUKA-I1-C2-S3-P1', 'Round-neck T-shirt', '450', '', '', '', '', ''];
    }

    public function importable(): bool
    {
        return true;
    }

    public function rows(): iterable
    {
        // Read by id only: an orderBy before lazyById makes its pages overlap and repeat rows.
        $rows = StoreVariant::query()->with(['store', 'itemVariant.item', 'individualPrice'])->lazyById(300);
        foreach ($rows as $sv) {
            $tier = $this->tier($sv);

            yield [
                $sv->store?->name,
                $sv->itemVariant?->sku,
                $sv->itemVariant?->item?->product_name,
                $tier['price'],
                $tier['discount'],
                $tier['ends'],
                $this->individual($sv),
                $sv->business_pool,
                $sv->active ? 'yes' : 'no',
            ];
        }
    }

    public function plan(CsvTable $table, User $by, array $options = []): ImportPlan
    {
        $plan = new ImportPlan();
        $have = array_flip($table->header);

        $stores = Store::query()->orderBy('name')->get(['id', 'name']);
        $storeMap = $stores->mapWithKeys(fn (Store $s): array => [mb_strtolower($s->name) => (int) $s->id])->all();
        $storeKnown = $stores->pluck('name')->all();
        $storesById = $stores->keyBy('id');

        $skus = array_values(array_filter(array_map(fn (array $row): string => $row['data']['sku'], $table->rows)));
        $variants = ItemVariant::query()->with('item')->whereIn('sku', $skus)->get()->keyBy('sku');
        $inStores = StoreVariant::query()->with('individualPrice')->whereIn('item_variant_id', $variants->pluck('id'))->get()
            ->keyBy(fn (StoreVariant $sv): string => $sv->store_id.'|'.$sv->item_variant_id);

        $seen = [];
        $goingOn = $goingOff = 0;

        foreach ($table->rows as $row) {
            $line = $row['line'];
            $d = $row['data'];
            $errorsBefore = count($table->errors());

            $storeId = $table->lookup($row, 'store', $storeMap, $storeKnown, true);
            $variant = $d['sku'] === '' ? null : $variants->get($d['sku']);
            if ($d['sku'] === '' || $variant === null) {
                $table->error($d['sku'] === '' ? 'sku is empty' : "there is no variant with sku '{$d['sku']}'", $line);
            }
            if ($storeId === null || $variant === null) {
                continue;
            }

            $sv = $inStores->get($storeId.'|'.$variant->id);
            $storeName = (string) $storesById->get($storeId)?->name;
            if ($sv === null) {
                $table->error("{$variant->sku} is not in {$storeName} yet: put its item in the store first", $line);

                continue;
            }
            if (isset($seen[$sv->id])) {
                $table->error("{$variant->sku} in {$storeName} is already on line {$seen[$sv->id]}", $line);

                continue;
            }
            $seen[$sv->id] = $line;

            $now = $this->tier($sv);
            $price = $now['price'];
            $discount = $now['discount'];
            $ends = $now['ends'];
            $individual = $this->individual($sv);
            $pool = $sv->business_pool !== null ? (int) $sv->business_pool : null;

            if ($this->given($d, 'price', $have)) {
                $value = $table->decimal($row, 'price');
                if ($value !== null && $value < 0) {
                    $table->error('price may not be negative', $line);
                }
                $price = $value ?? $price;
            }
            if ($this->given($d, 'discount_price', $have)) {
                $discount = $this->clear($d['discount_price']) ? null : $table->decimal($row, 'discount_price');
                if ($this->clear($d['discount_price'])) {
                    $ends = null;
                }
            }
            if ($this->given($d, 'discount_ends_at', $have)) {
                $ends = $this->clear($d['discount_ends_at']) ? null : $table->date($row, 'discount_ends_at');
            }
            if ($this->given($d, 'individual_price', $have)) {
                $individual = $this->clear($d['individual_price']) ? null : $table->decimal($row, 'individual_price');
                if ($individual !== null && $individual < 0) {
                    $table->error('individual_price may not be negative', $line);
                }
            }
            if ($this->given($d, 'business_pool', $have)) {
                $pool = $this->clear($d['business_pool']) ? null : $table->int($row, 'business_pool');
                if ($pool !== null && ($pool < 0 || $pool > 10_000_000)) {
                    $table->error('business_pool must be between 0 and 10,000,000', $line);
                }
            }

            if ($discount !== null && $ends === null) {
                $table->error('a discount_price needs a discount_ends_at (a date like 2026-12-31)', $line);
            }
            if ($discount !== null && $price !== null && $discount > $price) {
                $table->error("discount_price {$discount} is above the price {$price}", $line);
            }

            if (count($table->errors()) > $errorsBefore) {
                continue;
            }

            $unchanged = $this->same($price, $now['price']) && $this->same($discount, $now['discount']) && $ends === $now['ends']
                && $this->same($individual, $this->individual($sv)) && $pool === ($sv->business_pool !== null ? (int) $sv->business_pool : null);
            if ($unchanged) {
                $plan->same();

                continue;
            }
            if ($price === null) {
                $table->error("{$variant->sku} has no price yet: give a price", $line);

                continue;
            }

            // what it does to the sale: a price above zero puts it on sale unless an admin forced it off
            $forced = $sv->manual_status === 'forced';
            $willBeActive = $price > 0 && ! $forced;
            if ($willBeActive && ! $sv->active) {
                $goingOn++;
            } elseif (! $willBeActive && $sv->active) {
                $goingOff++;
            }
            if ($forced && $price > 0) {
                $plan->warn("{$variant->sku} in {$storeName} is switched off by an admin, so it stays off whatever its price");
            }
            if ($now['price'] !== null && $now['price'] > 0 && abs($price - $now['price']) / $now['price'] > 0.5) {
                $plan->warn(sprintf('%s in %s: %s → %s is a change of more than half (a slipped decimal?)', $variant->sku, $storeName, $this->money($now['price']), $this->money($price)));
            }
            if ($price > 0 && $variant->unit_cost !== null && (float) $variant->unit_cost > 0 && $price < (float) $variant->unit_cost) {
                $plan->warn(sprintf('%s in %s: the price %s is below its cost %s', $variant->sku, $storeName, $this->money($price), $this->money((float) $variant->unit_cost)));
            }

            $store = $storesById->get($storeId);
            $item = $variant->item;
            $payload = [
                'store_variant_id' => $sv->id,
                'price' => $price,
                'discount_price' => $discount,
                'discount_ends_at' => $ends,
                'individual_price' => $individual,
                'business_pool' => $pool,
            ];
            $plan->add('update', "{$storeName}: {$variant->sku} → ".$this->money($price), function () use ($store, $item, $payload, $sv): int {
                $this->prices->saveBase($store, $item, [$payload]);

                return (int) $sv->id;
            }, ['store_variant_id' => $sv->id, 'price' => $now['price'], 'discount_price' => $now['discount'], 'discount_ends_at' => $now['ends'], 'individual_price' => $this->individual($sv), 'business_pool' => $sv->business_pool, 'active' => (bool) $sv->active]);
        }

        if ($goingOn > 0) {
            $plan->warn("{$goingOn} variants go ON SALE with this file");
        }
        if ($goingOff > 0) {
            $plan->warn("{$goingOff} variants are taken OFF sale with this file");
        }

        return $plan;
    }

    /** @return array{price: ?float, discount: ?float, ends: ?string} the store price as the item page shows it (older single-row matrices too) */
    private function tier(StoreVariant $sv): array
    {
        $matrix = (array) $sv->pricing_matrix;
        $matrix = isset($matrix[0]) && is_array($matrix[0]) ? $matrix[0] : $matrix;
        $ends = $matrix['discount_ends_at'] ?? null;

        return [
            'price' => isset($matrix['price']) && $matrix['price'] !== '' ? (float) $matrix['price'] : null,
            'discount' => isset($matrix['discount_price']) && $matrix['discount_price'] !== '' ? (float) $matrix['discount_price'] : null,
            'ends' => $ends !== null && $ends !== '' ? substr((string) $ends, 0, 10) : null,
        ];
    }

    private function individual(StoreVariant $sv): ?float
    {
        $price = ((array) ($sv->individualPrice?->pricing_matrix ?? []))['price'] ?? null;

        return $price !== null && $price !== '' ? (float) $price : null;
    }

    /** @param array<string, string> $d @param array<string, int> $have */
    private function given(array $d, string $column, array $have): bool
    {
        return isset($have[$column]) && $d[$column] !== '';
    }

    private function clear(string $cell): bool
    {
        return strcasecmp($cell, 'CLEAR') === 0;
    }

    private function same(?float $a, ?float $b): bool
    {
        return $a === null || $b === null ? $a === $b : abs($a - $b) < 0.00001;
    }

    private function money(float $amount): string
    {
        return rtrim(rtrim(number_format($amount, 2, '.', ''), '0'), '.');
    }
}
