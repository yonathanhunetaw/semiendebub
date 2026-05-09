<?php

namespace App\Models\Inventory;

use App\Models\Item\ItemVariant; // Adjust this to your variant namespace
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class ItemStock extends Model
{
    use HasFactory;

    protected $fillable = [
        'item_variant_id',
        'location_id',
        'location_type',
        'quantity',
        'min_stock_level'
    ];

    /**
     * Get the parent location (Warehouse or Store).
     */
    public function location(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * Get the variant associated with this stock.
     */
    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class);
    }
}
