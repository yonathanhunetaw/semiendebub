<?php

declare(strict_types=1);

namespace App\Models\Finance;

use App\Models\Auth\User;
use App\Models\Document\Document;
use App\Models\Fulfillment\Vehicle;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Money spent: fuel for a staff ride, rent, salaries… Recorded (claimed) by
 * one person; it counts once finance or a global admin, someone else,
 * confirms it. Only App\Services\Finance\ExpenseService changes `status`.
 */
class Expense extends Model
{
    public const STATUS_CLAIMED = 'claimed';

    public const STATUS_CONFIRMED = 'confirmed';

    public const STATUS_REJECTED = 'rejected';

    public const CATEGORIES = ['fuel', 'rent', 'salaries', 'utilities', 'maintenance', 'tax', 'other'];

    protected $fillable = [
        'store_id', 'paid_from_till', 'category', 'amount', 'currency', 'spent_on', 'description', 'vehicle_id', 'litres',
        'source_type', 'source_id', 'document_id', 'status', 'recorded_by', 'decided_by', 'decided_at', 'reject_reason',
    ];

    protected $casts = [
        'store_id' => 'integer',
        'paid_from_till' => 'boolean',
        'amount' => 'decimal:2',
        'litres' => 'decimal:2',
        'spent_on' => 'date',
        'vehicle_id' => 'integer',
        'document_id' => 'integer',
        'recorded_by' => 'integer',
        'decided_by' => 'integer',
        'decided_at' => 'datetime',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function source(): MorphTo
    {
        return $this->morphTo();
    }

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(Document::class, 'document_id');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }
}
