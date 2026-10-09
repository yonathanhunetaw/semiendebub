<?php

namespace App\Models\Inventory;

use App\Models\Concerns\HasFacilityManagers;
use App\Models\Inventory\ItemStock;
use App\Services\Inventory\StockLocationTree;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Warehouse extends Model
{
    use HasFactory;

    /**
     * One or two named users oversee a warehouse, and only they (plus admins)
     * may drive its operations.
     *
     * The `manager` column below is a free-text name and stays for display;
     * authorization reads the assignments this trait provides.
     */
    use HasFacilityManagers;

    protected $fillable = [
        'name',
        'code',
        'location',
        'address',
        'store_id',
        'manager',
        'status'
    ];

    /**
     * Each warehouse is mirrored as a shared Main Hub in stock_locations until
     * this table is retired (STOCK_PLAN.md phase 5).
     */
    protected static function booted(): void
    {
        static::saved(function (self $warehouse): void {
            app(StockLocationTree::class)->syncWarehouse($warehouse);
        });

        static::deleted(function (self $warehouse): void {
            app(StockLocationTree::class)->forget(self::class, (int) $warehouse->id);
        });
    }

    public function getLocationAttribute($value): ?string
    {
        return $value ?: $this->address;
    }

    /**
     * Get all physical stock records located in this warehouse.
     *
     * The 'location' parameter tells Eloquent to look for
     * 'location_id' and 'location_type' in the item_stocks table.
     */
    public function stocks(): MorphMany
    {
        // Points to the ItemStock model in the same namespace
        return $this->morphMany(ItemStock::class, 'location');
    }

    /**
     * Capacity bands set for this warehouse, per variant.
     */
    public function variantCapacities(): MorphMany
    {
        return $this->morphMany(\App\Models\Store\StoreVariantCapacity::class, 'location');
    }

    /**
     * The stores this warehouse serves (one or several).
     */
    public function stores(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(\App\Models\Store\Store::class, 'store_warehouse')->withTimestamps();
    }

    /**
     * Legacy single store (`warehouses.store_id`), kept during the move to
     * stores(). Read stores() instead.
     */
    public function store()
    {
        // If a warehouse belongs to a specific store
        return $this->belongsTo(\App\Models\Store\Store::class, 'store_id');
    }
}
