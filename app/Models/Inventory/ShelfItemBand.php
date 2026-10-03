<?php

declare(strict_types=1);

namespace App\Models\Inventory;

use App\Models\Item\Item;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * How full an item's bin on a Store Shelf should be, in one of the item's own
 * pack units. See App\Services\Inventory\ShelfMatrix.
 *
 * @property int $stock_location_id
 * @property int $item_id
 * @property int|null $item_packaging_type_id
 * @property int $max_units
 * @property int $refill_units
 * @property int $critical_units
 */
class ShelfItemBand extends Model
{
    protected $fillable = [
        'stock_location_id',
        'item_id',
        'item_packaging_type_id',
        'max_units',
        'refill_units',
        'critical_units',
        'updated_by',
    ];

    protected $casts = [
        'stock_location_id' => 'integer',
        'item_id' => 'integer',
        'item_packaging_type_id' => 'integer',
        'max_units' => 'integer',
        'refill_units' => 'integer',
        'critical_units' => 'integer',
    ];

    public function shelf(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
