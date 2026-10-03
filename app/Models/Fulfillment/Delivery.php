<?php

namespace App\Models\Fulfillment;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Fulfilment of an external customer order.
 *
 * Distinct from a Shipment (bulk freight between structural nodes) and a
 * Transfer (localized balancing between internal locations): a Delivery always
 * ends at a customer, and it starts at the one place Pick & Pack picked from.
 * `source_location_*` is that place, so a driver's run can be traced back to a
 * shelf rather than to "the store".
 *
 * @see \App\Services\Fulfillment\MovementDomainService
 */
class Delivery extends Model
{
    use HasFactory;

    protected $table = 'deliveries';

    protected $fillable = [
        'sale_id',
        'source_location_type',
        'source_location_id',
        'source_store_id',
        'tracking_number',
        'status',
        'delivery_address',
        'recipient_name',
        'recipient_phone',
        'courier_name',
        'courier_id',
        'scheduled_for',
        'picked_up_at',
        'shipped_at',
        'delivered_at',
        'failed_at',
        'failure_reason',
        'proof_of_delivery',
        'notes',
    ];

    protected $casts = [
        'source_location_id' => 'integer',
        'scheduled_for' => 'datetime',
        'picked_up_at' => 'datetime',
        'shipped_at' => 'datetime',
        'delivered_at' => 'datetime',
        'failed_at' => 'datetime',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class, 'sale_id');
    }

    /** The exact location the goods were picked from. */
    public function sourceLocation(): MorphTo
    {
        return $this->morphTo('sourceLocation', 'source_location_type', 'source_location_id');
    }

    public function sourceStore(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Store\Store::class, 'source_store_id');
    }

    /**
     * The driver carrying this run.
     */
    public function courier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'courier_id');
    }

    /*
    |--------------------------------------------------------------------------
    | Scopes
    |--------------------------------------------------------------------------
    */

    public function scopeForCourier(Builder $query, int $courierId): Builder
    {
        return $query->where('courier_id', $courierId);
    }

    /** Runs still requiring action from the driver. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', ['pending', 'dispatched', 'in_transit']);
    }

    /**
     * Runs with something to collect: the order has been through Pick & Pack.
     * A delivery is opened at checkout (with the address), well before its
     * goods are picked; offering it to couriers then only leads to a run they
     * cannot start.
     */
    public function scopeReadyToCollect(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->whereNull('sale_id')
            ->orWhereHas('sale', fn (Builder $sale) => $sale->whereNotNull('sourcing_confirmed_at')));
    }

    public function scopeUnassigned(Builder $query): Builder
    {
        return $query->whereNull('courier_id');
    }
}
