<?php

namespace App\Models\Store;

use App\Models\Item\Item;
use App\Models\Inventory\ItemStock;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Model;

class StoreVariant extends Model
{
    protected $fillable = [
        'item_id',
        'item_variant_id',
        'store_id',
        'stock',
        'price',
        'status',
    ];

    public function item()
    {
        return $this->belongsTo(Item::class);
    }

    public function variant()
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }
    public function itemVariant()
    {
        // Make sure the foreign key 'item_variant_id' matches your database column
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }
    public function stocks()
    {
        return $this->hasMany(ItemStock::class, 'item_variant_id', 'item_variant_id');
        // reads: item_stocks.item_variant_id = store_variants.item_variant_id
    }
}
