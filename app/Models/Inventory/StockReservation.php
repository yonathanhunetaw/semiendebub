<?php

declare(strict_types=1);

namespace App\Models\Inventory;

use App\Models\Finance\SaleItem;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Units of one variant promised to one sale line at one store.
 *
 * Written only by App\Services\StockService (reserve / release / pick).
 *
 * @property int $id
 * @property int|null $sale_item_id
 * @property int $item_variant_id
 * @property int $store_id
 * @property int $quantity
 * @property string $status
 */
class StockReservation extends Model
{
    public const STATUS_OPEN = 'open';

    public const STATUS_PICKED = 'picked';

    public const STATUS_RELEASED = 'released';

    protected $fillable = [
        'sale_item_id',
        'item_variant_id',
        'store_id',
        'stock_location_id',
        'quantity',
        'status',
        'picked_stock_location_id',
        'expires_at',
        'picked_at',
        'released_at',
        'user_id',
    ];

    protected $casts = [
        'sale_item_id' => 'integer',
        'item_variant_id' => 'integer',
        'store_id' => 'integer',
        'stock_location_id' => 'integer',
        'quantity' => 'integer',
        'picked_stock_location_id' => 'integer',
        'expires_at' => 'datetime',
        'picked_at' => 'datetime',
        'released_at' => 'datetime',
    ];

    public function saleItem(): BelongsTo
    {
        return $this->belongsTo(SaleItem::class);
    }

    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    /** Set when the hold is at one leaf (a hub) rather than the store. */
    public function heldAt(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }

    public function pickedFrom(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'picked_stock_location_id');
    }

    public function isOpen(): bool
    {
        return $this->status === self::STATUS_OPEN;
    }

    /** @param  Builder<self>  $query */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_OPEN);
    }
}
