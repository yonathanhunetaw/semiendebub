<?php

namespace App\Models\Store;

use Illuminate\Database\Eloquent\Model;
// Import from the specific domain folders you mentioned
use App\Models\Auth\Customer;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Auth\User;
use App\Models\Item\Item;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Store extends Model
{
    use HasFactory;
    protected $fillable = [
        'name',
        'location',
        'status',
    ];

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
}
