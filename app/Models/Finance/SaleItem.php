<?php

namespace App\Models\Finance;

use App\Models\Auth\User;
use App\Models\Store\StoreVariant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * One line of a sale, and — once Pick & Pack has run — the exact place its
 * units came off.
 *
 * `source_location_*` is the same polymorphic pair item_stocks uses, so a line
 * can be sourced from a shelf, a back room, a remote warehouse or a main
 * warehouse without the sale table having to know which kinds exist.
 */
class SaleItem extends Model
{
    use HasFactory;

    protected $table = 'sale_items';

    protected $fillable = [
        'sale_id',
        'store_variant_id',
        'source_location_type',
        'source_location_id',
        'quantity',
        'picked_quantity',
        'picked_at',
        'picked_by',
        'packed_at',
        'unit_price',
        'subtotal',
        'tax_amount',
        'discount_amount',
        'total_price',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'picked_quantity' => 'integer',
        'source_location_id' => 'integer',
        'picked_at' => 'datetime',
        'packed_at' => 'datetime',
        'unit_price' => 'decimal:2',
        'subtotal' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total_price' => 'decimal:2',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class, 'sale_id');
    }

    public function storeVariant(): BelongsTo
    {
        return $this->belongsTo(StoreVariant::class, 'store_variant_id');
    }

    /** The shelf, back room or warehouse this line was picked from. */
    public function sourceLocation(): MorphTo
    {
        return $this->morphTo('sourceLocation', 'source_location_type', 'source_location_id');
    }

    public function picker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'picked_by');
    }

    /** Sourcing is settled once a location is named and the units are picked. */
    public function isSourced(): bool
    {
        return $this->source_location_type !== null
            && $this->source_location_id !== null
            && $this->picked_quantity >= $this->quantity;
    }
}
