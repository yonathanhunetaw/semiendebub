<?php

declare(strict_types=1);

namespace App\Models\Inventory;

use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * A difference between what was sent and what arrived, on one shipment line
 * or transfer. See App\Services\Inventory\ReceivingService.
 *
 *   short    fewer arrived; the rest stays In Delivery (the courier's
 *            custody) until found or written off
 *   damaged  arrived broken; booked in, then written off at once
 *   over     more arrived than was sent; the extra is booked in
 *
 * @property string $kind
 * @property string $status
 * @property int $quantity
 */
class ReceiptDiscrepancy extends Model
{
    public const SHORT = 'short';

    public const DAMAGED = 'damaged';

    public const OVER = 'over';

    public const OPEN = 'open';

    public const RESOLVED = 'resolved';

    protected $fillable = [
        'reference',
        'receivable_type',
        'receivable_id',
        'item_variant_id',
        'stock_location_id',
        'courier_id',
        'kind',
        'expected',
        'received',
        'quantity',
        'note',
        'status',
        'resolution',
        'resolution_note',
        'recorded_by',
        'resolved_by',
        'resolved_at',
    ];

    protected $casts = [
        'expected' => 'integer',
        'received' => 'integer',
        'quantity' => 'integer',
        'resolved_at' => 'datetime',
    ];

    public function receivable(): MorphTo
    {
        return $this->morphTo();
    }

    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }

    public function courier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'courier_id');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
