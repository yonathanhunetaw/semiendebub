<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Auth\User;
use App\Models\Inventory\Warehouse;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;

/**
 * A purchase order. Statuses only change through
 * App\Services\Procurement\PurchaseOrderService.
 *
 * Money: `subtotal_foreign` is the lines' total in the order's `currency`;
 * `total_amount` is the same in ETB at `exchange_rate`. Central by default
 * (`store_id` null): goods are bought for the hubs.
 */
class Purchase extends Model
{
    use HasFactory;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_SUBMITTED = 'submitted';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_ORDERED = 'ordered';

    public const STATUS_PARTIALLY_RECEIVED = 'partially_received';

    public const STATUS_RECEIVED = 'received';

    public const STATUS_CLOSED = 'closed';

    public const STATUS_CANCELLED = 'cancelled';

    /** In workflow order. */
    public const STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_SUBMITTED,
        self::STATUS_APPROVED,
        self::STATUS_ORDERED,
        self::STATUS_PARTIALLY_RECEIVED,
        self::STATUS_RECEIVED,
        self::STATUS_CLOSED,
        self::STATUS_CANCELLED,
    ];

    /** Lines and prices can still change. */
    public const EDITABLE = [self::STATUS_DRAFT];

    /** Placed with the supplier and not finished. */
    public const OPEN = [self::STATUS_APPROVED, self::STATUS_ORDERED, self::STATUS_PARTIALLY_RECEIVED];

    protected $table = 'purchases';

    protected $fillable = [
        'reference_number',
        'store_id',
        'warehouse_id',
        'supplier_name',
        'supplier_id',
        'vendor_id',
        'currency',
        'exchange_rate',
        'subtotal_foreign',
        'total_amount',
        'payment_terms',
        'payment_days',
        'payment_schedule',
        'payment_anchor',
        'incoterm',
        'status',
        'user_id',
        'purchased_at',
        'expected_at',
        'notes',
        'submitted_at',
        'submitted_by',
        'approved_at',
        'approved_by',
        'review_note',
        'ordered_by',
        'closed_at',
        'cancelled_at',
        'cancelled_by',
        'cancel_reason',
    ];

    protected $casts = [
        'exchange_rate' => 'decimal:6',
        'subtotal_foreign' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'payment_days' => 'integer',
        'payment_schedule' => 'array',
        'purchased_at' => 'datetime',
        'expected_at' => 'datetime',
        'submitted_at' => 'datetime',
        'approved_at' => 'datetime',
        'closed_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class)->withTrashed();
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PurchaseLine::class);
    }

    /** What we owe the supplier for the goods; written when the order is approved. */
    public function payable(): MorphOne
    {
        return $this->morphOne(SupplierPayable::class, 'payable')->where('kind', SupplierPayable::KIND_GOODS);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'store_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_id');
    }

    /** Who raised the order. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function orderer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'ordered_by');
    }

    public function canceller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    /**
     * The vendor-role user fulfilling this order (the older vendor app; not
     * the same as `supplier`).
     */
    public function vendor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendor_id');
    }

    /**
     * When an event a payment counts from happened: the order (placed with
     * the supplier), shipping or arrival. Shipping and arrival come from the
     * container (procurement P4/P5); until then they are unknown.
     */
    public function anchorDate(string $event): ?\Carbon\CarbonInterface
    {
        return match ($event) {
            'order' => $this->purchased_at,
            default => null,
        };
    }

    public function isEditable(): bool
    {
        return in_array($this->status, self::EDITABLE, true);
    }

    public function scopeForVendor(Builder $query, int $vendorId): Builder
    {
        return $query->where('vendor_id', $vendorId);
    }

    public function scopeReceived(Builder $query): Builder
    {
        return $query->whereIn('status', [self::STATUS_RECEIVED, self::STATUS_CLOSED]);
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', self::OPEN);
    }
}
