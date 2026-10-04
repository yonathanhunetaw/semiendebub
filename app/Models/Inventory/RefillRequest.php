<?php

declare(strict_types=1);

namespace App\Models\Inventory;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One leg of a refill — see the refill_requests migrations and
 * App\Services\Inventory\RefillEngine.
 *
 * Floor legs never wait: they carry a floor → shelf transfer from the start.
 * Every other leg is a *suggestion* (pending) until a store manager adds it to
 * the Remote Hub → Store list or to a shipment manifest (in_progress) — that is
 * the approval. Then fulfilled when it lands, or cancelled.
 *
 * `requested_quantity` is what was asked for; `quantity` is what is being sent.
 *
 * @property int $id
 * @property string $reference
 * @property int $store_id
 * @property int|null $shelf_location_id
 * @property int $item_id
 * @property int $item_variant_id
 * @property string $source
 * @property int $quantity
 * @property string $status
 * @property bool $urgent
 * @property string $origin
 * @property int|null $transfer_id
 * @property int|null $shipment_id
 */
class RefillRequest extends Model
{
    public const STATUS_PENDING = 'pending';

    /** No longer a resting state (2026-10-04 v2); kept so old rows and code read. */
    public const STATUS_APPROVED = 'approved';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_FULFILLED = 'fulfilled';

    public const STATUS_CANCELLED = 'cancelled';

    /** Still going to raise the shelf's figure (or the floor's, on the way). */
    public const OPEN_STATUSES = [self::STATUS_PENDING, self::STATUS_APPROVED, self::STATUS_IN_PROGRESS];

    public const DESTINATION_STORE = 'store';

    public const DESTINATION_REMOTE_HUB = 'remote_hub';

    public const ORIGIN_AUTO = 'auto';

    public const ORIGIN_MANUAL = 'manual';

    protected $fillable = [
        'reference',
        'store_id',
        'shelf_location_id',
        'target_location_id',
        'item_id',
        'item_variant_id',
        'source',
        'destination',
        'quantity',
        'requested_quantity',
        'status',
        'urgent',
        'origin',
        'transfer_id',
        'shipment_id',
        'raised_by',
        'approved_by',
        'approved_at',
        'accepted_by',
        'accepted_at',
        'cancelled_by',
        'cancelled_at',
        'cancel_reason',
        'fulfilled_at',
        'notes',
    ];

    protected $casts = [
        'store_id' => 'integer',
        'shelf_location_id' => 'integer',
        'item_id' => 'integer',
        'item_variant_id' => 'integer',
        'quantity' => 'integer',
        'requested_quantity' => 'integer',
        'target_location_id' => 'integer',
        'urgent' => 'boolean',
        'transfer_id' => 'integer',
        'shipment_id' => 'integer',
        'approved_at' => 'datetime',
        'accepted_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'fulfilled_at' => 'datetime',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function shelf(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'shelf_location_id');
    }

    /** The location being refilled: a shelf, or a Remote Hub restocking its own lines. */
    public function target(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'target_location_id');
    }

    public function canceller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class);
    }

    public function transfer(): BelongsTo
    {
        return $this->belongsTo(Transfer::class);
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function raiser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'raised_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** @param  Builder<self>  $query */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', self::OPEN_STATUSES);
    }

    /** Suggestions the store manager has still to act on. @param  Builder<self>  $query */
    public function scopeAwaitingApproval(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_PENDING);
    }

    /** Was it changed from what was asked for? */
    public function wasAdjusted(): bool
    {
        return $this->requested_quantity !== null && $this->requested_quantity !== $this->quantity;
    }

    /** On the Remote Hub → Store list but not yet accepted at the hub. */
    public function awaitsHub(): bool
    {
        return $this->source === ItemRefillRoute::SOURCE_REMOTE_HUB
            && $this->status === self::STATUS_IN_PROGRESS
            && $this->transfer_id === null;
    }

    public function isOpen(): bool
    {
        return in_array($this->status, self::OPEN_STATUSES, true);
    }

    public function needsApproval(): bool
    {
        return $this->source !== ItemRefillRoute::SOURCE_FLOOR;
    }
}
