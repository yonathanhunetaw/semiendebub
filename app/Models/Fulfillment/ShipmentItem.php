<?php

declare(strict_types=1);

namespace App\Models\Fulfillment;

use App\Models\Item\ItemVariant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One SKU line on a shipment manifest.
 */
class ShipmentItem extends Model
{
    use HasFactory;

    protected $table = 'shipment_items';

    protected $fillable = [
        'shipment_id',
        'item_variant_id',
        'quantity',
        'picked_quantity',
        'cbm',
        'weight_kg',
        'unit',
        'location',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'picked_quantity' => 'integer',
        'cbm' => 'decimal:3',
        'weight_kg' => 'decimal:2',
    ];

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }

    /** Units the picker could not find. */
    public function getShortfallAttribute(): int
    {
        return max(0, $this->quantity - $this->picked_quantity);
    }
}
