<?php

declare(strict_types=1);

namespace App\Models\StockKeeper;

use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * A place inside a store that holds stock.
 *
 * A store's total lives on item_stocks at location_type = Store. This model
 * says where inside the store some of that total sits — on the shop floor, or
 * in the back room — so the figures the admin tool shows are a record rather
 * than a percentage of the total computed in the browser.
 */
class ItemInventoryLocation extends Model
{
    use HasFactory;

    /** Stock that customers can pick up themselves. */
    public const KIND_SHELF = 'shelf';

    /** Stock held behind the counter or in the store's own stockroom. */
    public const KIND_BACKROOM = 'backroom';

    /** Anything that is not part of a store's own shelf/back-room split. */
    public const KIND_OTHER = 'other';

    protected $fillable = ['name', 'kind', 'address', 'store_id'];

    /**
     * Positional stock rows pointing at this location.
     *
     * Morph, not hasMany: item_stocks is keyed by (location_type, location_id)
     * and holds rows for stores and warehouses too. The previous hasMany
     * matched on item_inventory_location_id, a column item_stocks does not
     * have, so it could only ever have thrown.
     */
    public function stocks(): MorphMany
    {
        return $this->morphMany(ItemStock::class, 'location');
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    /** @param  \Illuminate\Database\Eloquent\Builder<self>  $query */
    public function scopeShelves($query)
    {
        return $query->where('kind', self::KIND_SHELF);
    }

    /** @param  \Illuminate\Database\Eloquent\Builder<self>  $query */
    public function scopeBackrooms($query)
    {
        return $query->where('kind', self::KIND_BACKROOM);
    }
}
