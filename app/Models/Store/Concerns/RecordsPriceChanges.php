<?php

declare(strict_types=1);

namespace App\Models\Store\Concerns;

use App\Models\Store\PriceChange;
use App\Models\Store\StoreVariant;
use Illuminate\Database\Eloquent\Model;
use Throwable;

/**
 * Keeps a history of a price model's pricing_matrix: a row in price_changes
 * when it is first set and every time it really changes. A failure to record
 * never stops the price change itself.
 */
trait RecordsPriceChanges
{
    public static function bootRecordsPriceChanges(): void
    {
        static::created(function (Model $model): void {
            self::recordPriceChange($model, null, $model->pricing_matrix);
        });

        static::updated(function (Model $model): void {
            if ($model->wasChanged('pricing_matrix')) {
                self::recordPriceChange($model, $model->getOriginal('pricing_matrix'), $model->pricing_matrix);
            }
        });
    }

    /** The headline price of a matrix: a flat {price} or the first tier of a ladder. */
    public static function headlinePrice(mixed $matrix): ?float
    {
        $matrix = is_string($matrix) ? (json_decode($matrix, true) ?: []) : (array) ($matrix ?? []);
        $tier = isset($matrix[0]) && is_array($matrix[0]) ? $matrix[0] : $matrix;

        return isset($tier['price']) && is_numeric($tier['price']) ? round((float) $tier['price'], 2) : null;
    }

    private static function recordPriceChange(Model $model, mixed $old, mixed $new): void
    {
        $old = is_string($old) ? json_decode($old, true) : $old;
        $new = is_string($new) ? json_decode($new, true) : $new;

        if ($old == $new) {
            return;
        }

        try {
            $storeVariantId = $model instanceof StoreVariant ? (int) $model->id : (int) ($model->store_variant_id ?? 0);
            $storeId = $model instanceof StoreVariant
                ? $model->store_id
                : StoreVariant::query()->whereKey($storeVariantId)->value('store_id');

            PriceChange::query()->create([
                'kind' => static::PRICE_KIND,
                'priceable_type' => $model::class,
                'priceable_id' => (int) $model->getKey(),
                'store_variant_id' => $storeVariantId ?: null,
                'store_id' => $storeId !== null ? (int) $storeId : null,
                'old_matrix' => $old,
                'new_matrix' => $new,
                'old_price' => self::headlinePrice($old),
                'new_price' => self::headlinePrice($new),
                'changed_by' => auth()->id(),
            ]);
        } catch (Throwable $e) {
            report($e);
        }
    }
}
