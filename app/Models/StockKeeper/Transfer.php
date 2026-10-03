<?php

declare(strict_types=1);

namespace App\Models\StockKeeper;

use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Localized inventory balancing: one variant moving between two places that
 * are not both freight nodes.
 *
 * Remote warehouse → store back room, back room → shop floor, store → store.
 * A load between two warehouses is a Shipment and belongs to
 * App\Models\Fulfillment\Shipment; fulfilling a customer order is a Delivery.
 * The boundary is enforced by App\Services\Fulfillment\MovementDomainService,
 * not by convention.
 *
 * Two independent axes describe a row:
 *
 *   status          where the stock is — pending, in_transit, completed, cancelled
 *   approval_state  whether anyone has agreed to it happening at all
 *
 * They are separate because `pending` already means "queued, go and dispatch
 * it". A machine-generated proposal is also pending, and must not be
 * dispatchable, so it carries approval_state = pending until a store manager
 * approves it. Hand-raised transfers are `not_required` and behave exactly as
 * they always did.
 */
class Transfer extends Model
{
    use HasFactory;

    /** Raised by a person, on the spot. */
    public const ORIGIN_MANUAL = 'manual';

    /** Raised by the capacity planner because a location hit its floor. */
    public const ORIGIN_AUTO = 'auto_replenishment';

    public const APPROVAL_NOT_REQUIRED = 'not_required';

    public const APPROVAL_PENDING = 'pending';

    public const APPROVAL_APPROVED = 'approved';

    public const APPROVAL_REJECTED = 'rejected';

    protected $table = 'transfers';

    protected $fillable = [
        'reference',
        'item_variant_id',
        'store_variant_id',
        'from_store_id',
        'to_store_id',
        'from_location_id',
        'to_location_id',
        'source_location_type',
        'source_location_id',
        'destination_location_type',
        'destination_location_id',
        'quantity',
        'origin',
        'approval_state',
        'approved_by',
        'approved_at',
        'rejected_by',
        'rejected_at',
        'rejection_reason',
        'observed_quantity',
        'min_capacity',
        'max_capacity',
        'status',
        'initiated_by',
        'courier_id',
        'completed_at',
        'dispatched_at',
        'cancelled_at',
        'cancelled_by',
        'eta',
        'notes',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'observed_quantity' => 'integer',
        'min_capacity' => 'integer',
        'max_capacity' => 'integer',
        'source_location_id' => 'integer',
        'destination_location_id' => 'integer',
        'completed_at' => 'datetime',
        'dispatched_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'approved_at' => 'datetime',
        'rejected_at' => 'datetime',
        'eta' => 'datetime',
    ];

    // ─────────────────────────────────────────────────────────────────────
    // Relations
    // ─────────────────────────────────────────────────────────────────────

    public function fromStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'from_store_id');
    }

    public function toStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'to_store_id');
    }

    /**
     * Legacy sub-location endpoints, constrained to item_inventory_locations.
     *
     * Kept because older rows populate them. New writers use the polymorphic
     * pair below, which can also name a warehouse or a whole facility.
     *
     * Previously typed against App\Models\Inventory\ItemInventoryLocation —
     * a class that does not exist, so touching either relation threw.
     */
    public function fromLocation(): BelongsTo
    {
        return $this->belongsTo(ItemInventoryLocation::class, 'from_location_id');
    }

    public function toLocation(): BelongsTo
    {
        return $this->belongsTo(ItemInventoryLocation::class, 'to_location_id');
    }

    /** Where the stock leaves from — a shelf, back room, warehouse or facility. */
    public function sourceLocation(): MorphTo
    {
        return $this->morphTo('sourceLocation', 'source_location_type', 'source_location_id');
    }

    /** Where the stock is going. */
    public function destinationLocation(): MorphTo
    {
        return $this->morphTo('destinationLocation', 'destination_location_type', 'destination_location_id');
    }

    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }

    public function storeVariant(): BelongsTo
    {
        return $this->belongsTo(StoreVariant::class, 'store_variant_id');
    }

    public function initiator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'initiated_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function rejecter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    // ─────────────────────────────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────────────────────────────

    public function scopeCompleted(Builder $query): Builder
    {
        return $query->where('status', 'completed');
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', 'pending');
    }

    /** Proposals a store manager has still to rule on. */
    public function scopeAwaitingApproval(Builder $query): Builder
    {
        return $query->where('approval_state', self::APPROVAL_PENDING)
            ->whereNotIn('status', ['cancelled', 'completed']);
    }

    /**
     * The active transfer list: everything cleared to happen.
     *
     * A proposal awaiting approval is deliberately absent — that is the whole
     * point of the gate.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('approval_state', '!=', self::APPROVAL_PENDING)
            ->whereNotIn('status', ['cancelled']);
    }

    public function scopeAutoProposed(Builder $query): Builder
    {
        return $query->where('origin', self::ORIGIN_AUTO);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Behaviour
    // ─────────────────────────────────────────────────────────────────────

    public function awaitsApproval(): bool
    {
        return $this->approval_state === self::APPROVAL_PENDING;
    }

    public function isApproved(): bool
    {
        return in_array($this->approval_state, [self::APPROVAL_APPROVED, self::APPROVAL_NOT_REQUIRED], true);
    }

    public function isAutoProposed(): bool
    {
        return $this->origin === self::ORIGIN_AUTO;
    }

    /**
     * The store whose manager owns the decision: the destination, because
     * replenishment is pulled, not pushed.
     */
    public function approvingStoreId(): ?int
    {
        return $this->to_store_id !== null ? (int) $this->to_store_id : null;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Accessors
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Frontend UI still speaks "queued" (matching the original design),
     * but the DB enum is 'pending'. Translate on the way out.
     *
     * A proposal reports itself as `proposed` so a board cannot file it beside
     * work the floor is expected to action.
     */
    public function getUiStatusAttribute(): string
    {
        if ($this->awaitsApproval()) {
            return 'proposed';
        }

        return $this->status === 'pending' ? 'queued' : $this->status;
    }

    /** The delivery user carrying this transfer between two sites. */
    public function courier(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(\App\Models\Auth\User::class, 'courier_id');
    }
}
