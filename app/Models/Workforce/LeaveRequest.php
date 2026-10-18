<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Days off. Only App\Services\Workforce\LeaveService changes `status`.
 *
 * @property \Illuminate\Support\Carbon $starts_on
 * @property \Illuminate\Support\Carbon $ends_on
 */
class LeaveRequest extends Model
{
    public const STATUS_REQUESTED = 'requested';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_CANCELLED = 'cancelled';

    public const TYPES = ['annual', 'sick', 'unpaid', 'other'];

    protected $fillable = [
        'user_id', 'type', 'starts_on', 'ends_on', 'note', 'status',
        'created_by', 'decided_by', 'decided_at', 'decision_note',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'starts_on' => 'date',
        'ends_on' => 'date',
        'decided_at' => 'datetime',
        'created_by' => 'integer',
        'decided_by' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    /** Leave that covers part of a date range. @param Builder<LeaveRequest> $query */
    public function scopeOverlapping(Builder $query, string $from, string $to): Builder
    {
        return $query->whereDate('starts_on', '<=', $to)->whereDate('ends_on', '>=', $from);
    }

    /** Whole days, both ends counted. */
    public function days(): int
    {
        return (int) $this->starts_on->diffInDays($this->ends_on) + 1;
    }
}
