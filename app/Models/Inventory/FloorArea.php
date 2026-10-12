<?php

declare(strict_types=1);

namespace App\Models\Inventory;

use App\Models\Item\Item;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A rectangle on a hub's floor, in metres from the floor's top-left corner.
 * Items are placed in areas; their quantities stay in item_stocks.
 *
 * @property int $stock_location_id
 * @property string $code
 * @property string|null $name
 * @property string $kind
 * @property float $x_m
 * @property float $y_m
 * @property float $width_m
 * @property float $length_m
 */
class FloorArea extends Model
{
    public const KINDS = ['storage', 'pallet', 'rack', 'bulk', 'cold', 'dock', 'aisle'];

    protected $fillable = [
        'stock_location_id',
        'code',
        'name',
        'kind',
        'x_m',
        'y_m',
        'width_m',
        'length_m',
        'notes',
    ];

    protected $casts = [
        'stock_location_id' => 'integer',
        'x_m' => 'float',
        'y_m' => 'float',
        'width_m' => 'float',
        'length_m' => 'float',
    ];

    public function location(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }

    public function items(): BelongsToMany
    {
        return $this->belongsToMany(Item::class, 'floor_area_items')->withPivot('placed_by')->withTimestamps();
    }
}
