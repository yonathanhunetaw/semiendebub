<?php

namespace App\Models\StockKeeper;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class ItemStock extends Model
{
    use HasFactory;

    protected $fillable = [
        'item_variant_id', // This is the column that actually exists in your DB
        'location_id',
        'location_type',
        'quantity',
        'min_stock_level',
    ];

    public function location(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * Link to the StoreVariant.
     * We pass 'item_variant_id' as the second argument to tell Laravel:
     * "Stop looking for store_variant_id and use item_variant_id instead."
     */
    public function storeVariant(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Store\StoreVariant::class, 'item_variant_id');
    }

    /**
     * Alias to keep your itemVariant() relationship working if used elsewhere.
     */
    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Store\StoreVariant::class, 'item_variant_id');
    }
}
