<?php

namespace App\Models\Store;

use Illuminate\Database\Eloquent\Model;
// Import from the specific domain folders you mentioned
use App\Models\Auth\Customer;
use App\Models\Concerns\HasFacilityManagers;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Services\Inventory\StockLocationTree;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Store extends Model
{
    use HasFactory;

    /**
     * Warehouse-type facilities are overseen by one or two named managers.
     *
     * A retail store may carry assignments too — nothing forbids it — but the
     * policies only *require* them for warehouses, which is where the rule the
     * business asked for applies.
     */
    use HasFacilityManagers;

    protected $fillable = [
        'name',
        'type',
        'code',
        'location',
        'status',
    ];

    /*
    |--------------------------------------------------------------------------
    | Facility types
    |--------------------------------------------------------------------------
    |
    | A "store" row is any facility that can hold stock: a retail outlet, a
    | central warehouse, or a remote/overflow warehouse. Shipments move between
    | any two of them.
    |
    */

    public const TYPE_RETAIL = 'retail';

    public const TYPE_CENTRAL_WAREHOUSE = 'central_warehouse';

    public const TYPE_REMOTE_WAREHOUSE = 'remote_warehouse';

    /** @return array<string, string> */
    public static function facilityTypes(): array
    {
        return [
            self::TYPE_RETAIL => 'Retail Store',
            self::TYPE_CENTRAL_WAREHOUSE => 'Main Hub',
            self::TYPE_REMOTE_WAREHOUSE => 'Remote Hub',
        ];
    }

    public function getTypeLabelAttribute(): string
    {
        return self::facilityTypes()[$this->type] ?? 'Facility';
    }

    public function isWarehouse(): bool
    {
        return in_array($this->type, [self::TYPE_CENTRAL_WAREHOUSE, self::TYPE_REMOTE_WAREHOUSE], true);
    }

    /**
     * A main (central) warehouse — a structural node in the freight network.
     *
     * Movement between two of these is a Shipment, never a Transfer.
     *
     * @see \App\Services\Fulfillment\MovementDomainService
     */
    public function isMainWarehouse(): bool
    {
        return $this->type === self::TYPE_CENTRAL_WAREHOUSE;
    }

    public function isRemoteWarehouse(): bool
    {
        return $this->type === self::TYPE_REMOTE_WAREHOUSE;
    }

    /**
     * Every new store gets the sub-locations the stock tool offers.
     *
     * The admin stock tool reports a store's holding in three places — Store
     * Shelf, Store Room, Remote Warehouse — and the shelf needs a row in
     * item_inventory_locations to hang stock on. A migration backfilled the
     * stores that existed when it ran, but a store created afterwards had
     * none, and a store with no shelf row reports its whole total as back room
     * for ever. Creating them here makes it an invariant of the model rather
     * than something each caller has to remember.
     *
     * Remote Warehouse is deliberately not created here: it is a row in
     * `warehouses` joined by Store::warehouse(), not every store has one, and
     * inventing an empty one would duplicate a concept that already exists.
     *
     * Quantities start at zero. Nothing records what is on the floor on the
     * day a store opens, and a figure derived from a percentage is what this
     * replaces.
     */
    protected static function booted(): void
    {
        static::created(function (self $store): void {
            foreach ([
                ['Shop Floor', ItemInventoryLocation::KIND_SHELF],
                ['Back Room', ItemInventoryLocation::KIND_BACKROOM],
            ] as [$name, $kind]) {
                $store->inventoryLocations()->firstOrCreate(
                    ['kind' => $kind],
                    ['name' => $name, 'address' => ''],
                );
            }

            // The same store in the one location tree: group node + shelf +
            // back room. A Remote Hub is never invented (STOCK_PLAN.md §2.1).
            app(StockLocationTree::class)->syncStore($store);
        });

        static::updated(function (self $store): void {
            if ($store->wasChanged(['name', 'location', 'status', 'type'])) {
                app(StockLocationTree::class)->syncStore($store);
            }
        });

        // A retail store's nodes go with it through the stores FK cascade; a
        // warehouse-type row's hub has no store_id, so it is dropped here.
        static::deleted(function (self $store): void {
            app(StockLocationTree::class)->forget(self::class, (int) $store->id);
        });
    }

    public function scopeWarehouses($query)
    {
        return $query->whereIn('type', [self::TYPE_CENTRAL_WAREHOUSE, self::TYPE_REMOTE_WAREHOUSE]);
    }

    public function scopeRetail($query)
    {
        return $query->where('type', self::TYPE_RETAIL);
    }

    // Items in this store (Linked via your item_store migration)
    public function items()
    {
        return $this->belongsToMany(Item::class, 'item_store')
            ->withPivot('active')
            ->withTimestamps();
    }

    // Inventory locations (Now correctly pointing to StockKeeper)
    public function inventoryLocations()
    {
        return $this->hasMany(ItemInventoryLocation::class, 'store_id');
    }

    // Variants for this store
    public function variants()
    {
        return $this->hasMany(StoreVariant::class);
    }

    // Sellers (Assuming User is also in Auth)
    public function sellers()
    {
        return $this->hasMany(User::class)->where('role', 'seller');
    }

    // Customers (Now correctly pointing to Auth)
    public function customers()
    {
        return $this->hasMany(Customer::class);
    }
    public function storeVariants()
    {
        // This tells Laravel that the store has many records in the store_variants table
        return $this->hasMany(\App\Models\Store\StoreVariant::class, 'store_id');
    }

    /**
     * Capacity bands set for this facility as a whole, per variant.
     */
    public function variantCapacities()
    {
        return $this->morphMany(StoreVariantCapacity::class, 'location');
    }

    /**
     * The warehouses that serve this store; a warehouse may serve several.
     */
    public function warehouses(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(\App\Models\Inventory\Warehouse::class, 'store_warehouse')->withTimestamps();
    }

    /**
     * Legacy: the one warehouse whose `warehouses.store_id` points here.
     * Nothing reads it any more; use warehouses().
     */
    public function warehouse()
    {
        return $this->hasOne(\App\Models\Inventory\Warehouse::class, 'store_id');
    }
}
