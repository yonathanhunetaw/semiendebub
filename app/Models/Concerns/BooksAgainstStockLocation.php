<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use App\Models\Inventory\StockLocation;
use App\Services\Inventory\StockLocationTree;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Keeps item_stocks.stock_location_id in step with the legacy morph address.
 *
 * STOCK_PLAN.md phase 2: every stock row carries the stockable leaf it lives
 * at, while the writers that still address stock as (location_type,
 * location_id) keep working unchanged. Whenever such a writer creates a row,
 * or moves one to another morph address, the leaf is resolved here. Retired
 * in phase 5 together with the morph columns.
 *
 * Mixed into both App\Models\Inventory\ItemStock and
 * App\Models\StockKeeper\ItemStock, which share the table.
 */
trait BooksAgainstStockLocation
{
    public static function bootBooksAgainstStockLocation(): void
    {
        static::saving(function (self $stock): void {
            $moved = $stock->isDirty(['location_type', 'location_id']);

            // A writer that names the leaf itself (the gateway) is trusted.
            if (($stock->stock_location_id === null || ($moved && ! $stock->isDirty('stock_location_id')))
                && $stock->location_type !== null
                && $stock->location_id !== null) {
                $stock->stock_location_id = app(StockLocationTree::class)
                    ->leafIdFor((string) $stock->location_type, (int) $stock->location_id);
            }
        });
    }

    public function stockLocation(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class);
    }
}
