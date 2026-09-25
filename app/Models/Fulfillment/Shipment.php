<?php

declare(strict_types=1);

namespace App\Models\Fulfillment;

use App\Models\Auth\User;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One vehicle-load moving between two stores, carrying many SKUs.
 *
 * Shared by four roles: Admin builds and schedules it, StockKeeper picks and
 * dispatches it, Delivery carries it, and the destination (Seller or
 * StockKeeper) receives it.
 */
class Shipment extends Model
{
    use HasFactory;

    protected $table = 'shipments';

    protected $fillable = [
        'reference',
        'origin_store_id',
        'destination_store_id',
        'status',
        'vehicle_name',
        'vehicle_plate',
        'vehicle_max_cbm',
        'courier_id',
        'scheduled_for',
        'picked_at',
        'dispatched_at',
        'in_transit_at',
        'delivered_at',
        'received_at',
        'cancelled_at',
        'eta',
        'gate_pass',
        'slot',
        'distance_km',
        'notes',
        'cancel_reason',
        'created_by',
    ];

    protected $casts = [
        'scheduled_for' => 'datetime',
        'picked_at' => 'datetime',
        'dispatched_at' => 'datetime',
        'in_transit_at' => 'datetime',
        'delivered_at' => 'datetime',
        'received_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'eta' => 'datetime',
        'vehicle_max_cbm' => 'decimal:2',
        'distance_km' => 'decimal:2',
    ];

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function items(): HasMany
    {
        return $this->hasMany(ShipmentItem::class);
    }

    public function origin(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'origin_store_id');
    }

    public function destination(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'destination_store_id');
    }

    public function courier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'courier_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /*
    |--------------------------------------------------------------------------
    | Scopes
    |--------------------------------------------------------------------------
    */

    /** Everything a given store is either sending or receiving. */
    public function scopeForStore(Builder $query, int $storeId): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->where('origin_store_id', $storeId)
            ->orWhere('destination_store_id', $storeId));
    }

    public function scopeOutboundFrom(Builder $query, int $storeId): Builder
    {
        return $query->where('origin_store_id', $storeId);
    }

    public function scopeInboundTo(Builder $query, int $storeId): Builder
    {
        return $query->where('destination_store_id', $storeId);
    }

    /** Still moving — not yet received or cancelled. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNotIn('status', ['received', 'cancelled']);
    }

    /** Waiting on the warehouse floor. */
    public function scopeAwaitingPick(Builder $query): Builder
    {
        return $query->whereIn('status', ['scheduled', 'picking']);
    }

    /** Available for a courier to claim. */
    public function scopeClaimable(Builder $query): Builder
    {
        return $query->where('status', 'dispatched')->whereNull('courier_id');
    }

    public function scopeForCourier(Builder $query, int $courierId): Builder
    {
        return $query->where('courier_id', $courierId);
    }

    /*
    |--------------------------------------------------------------------------
    | Accessors
    |--------------------------------------------------------------------------
    */

    public function getTotalUnitsAttribute(): int
    {
        return (int) $this->items->sum('quantity');
    }

    public function getTotalCbmAttribute(): float
    {
        return (float) $this->items->sum('cbm');
    }

    public function getTotalWeightAttribute(): float
    {
        return (float) $this->items->sum('weight_kg');
    }

    /** How full the assigned vehicle is, as a percentage. */
    public function getLoadPercentageAttribute(): int
    {
        $max = (float) ($this->vehicle_max_cbm ?? 0);

        if ($max <= 0) {
            return 0;
        }

        return (int) min(100, round(($this->total_cbm / $max) * 100));
    }
}
