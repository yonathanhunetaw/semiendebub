<?php

namespace App\Models\Inventory;

use App\Models\Inventory\ItemStock;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Warehouse extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'code',
        'address',
        'store_id',
        'manager',
        'status'
    ];

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

    public function store()
    {
        // If a warehouse belongs to a specific store
        return $this->belongsTo(\App\Models\Store\Store::class);
    }
}
