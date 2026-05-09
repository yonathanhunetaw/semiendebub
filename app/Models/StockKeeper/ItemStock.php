<?php

namespace App\Models\StockKeeper;

use App\Models\Item\ItemVariant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class ItemStock extends Model
{
    use HasFactory;

    protected $fillable = [
        'item_variant_id',
        'location_id',
        'location_type',
        'quantity',
        'min_stock_level',
    ];

    /**
     * The parent location (can be a Warehouse or a Store).
     * This looks at 'location_id' and 'location_type' in your DB.
     */
    public function location(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * The specific SKU/Variant this stock record represents.
     */
    public function itemVariant(): BelongsTo
    {
        // Ensure the namespace here matches where your ItemVariant model actually lives
        return $this->belongsTo(ItemVariant::class);
    }
}
