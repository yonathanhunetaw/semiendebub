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
        'origin_stock_location_id',
        'destination_stock_location_id',
        'status',
        'vehicle_name',
        'vehicle_plate',
        'vehicle_max_cbm',
        'vehicle_id',
        'courier_id',
        'eligible_courier_ids',
        'scheduled_for',
        'schedule_options',
        'agreed_scheduled_for',
        'party_agreements',
        'picked_at',
        'prepared_at',
        'prepared_by',
        'courier_started_at',
        'courier_checked_at',
        'courier_signature',
        'courier_signed_at',
        'receiver_checked_at',
        'receiver_signature',
        'received_by',
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

    /** Signatures are large; screens ask for them explicitly. */
    protected $hidden = ['courier_signature', 'receiver_signature'];

    protected $casts = [
        'scheduled_for' => 'datetime',
        'agreed_scheduled_for' => 'datetime',
        'schedule_options' => 'array',
        'party_agreements' => 'array',
        'eligible_courier_ids' => 'array',
        'picked_at' => 'datetime',
        'prepared_at' => 'datetime',
        'courier_started_at' => 'datetime',
        'courier_checked_at' => 'datetime',
        'courier_signed_at' => 'datetime',
        'receiver_checked_at' => 'datetime',
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

    /** The Main Hub this run leaves from. */
    public function originLocation(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(\App\Models\Inventory\StockLocation::class, 'origin_stock_location_id');
    }

    /** The store floor or Remote Hub this run lands at. */
    public function destinationLocation(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(\App\Models\Inventory\StockLocation::class, 'destination_stock_location_id');
    }

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

    /** The fleet car the creator picked to carry this run. */
    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    /**
     * The drivers the creator offered this run to. Empty means any driver.
     *
     * @return array<int, int>
     */
    public function eligibleCourierIds(): array
    {
        return array_values(array_map('intval', $this->eligible_courier_ids ?? []));
    }

    /** May this driver take the run? Open to all when no drivers were picked. */
    public function courierIsEligible(int $userId): bool
    {
        $ids = $this->eligibleCourierIds();

        return $ids === [] || in_array($userId, $ids, true);
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
    /** Still collecting the four party ticks. */
    public function scopeAwaitingAgreement(Builder $query): Builder
    {
        return $query->whereIn('status', ['draft', 'pending_agreement']);
    }

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
