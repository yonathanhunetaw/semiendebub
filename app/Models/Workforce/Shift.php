<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One person at one site from a time to a time. Only
 * App\Services\Workforce\RotaService changes `status`.
 *
 * @property \Illuminate\Support\Carbon $starts_at
 * @property \Illuminate\Support\Carbon $ends_at
 */
class Shift extends Model
{
    public const STATUS_DRAFT = 'draft';

    /** Sent to the person; waiting for them to accept. */
    public const STATUS_PUBLISHED = 'published';

    public const STATUS_ACCEPTED = 'accepted';

    /** The person asked for a change (with a note); the manager decides. */
    public const STATUS_CHANGE_REQUESTED = 'change_requested';

    public const STATUS_CANCELLED = 'cancelled';

    public const DUTY_NONE = 'none';

    public const DUTY_OPENER = 'opener';

    public const DUTY_CLOSER = 'closer';

    public const DUTIES = [self::DUTY_NONE, self::DUTY_OPENER, self::DUTY_CLOSER];

    /** Statuses that count as someone being there. */
    public const LIVE = [self::STATUS_DRAFT, self::STATUS_PUBLISHED, self::STATUS_ACCEPTED, self::STATUS_CHANGE_REQUESTED];

    protected $fillable = [
        'stock_location_id', 'user_id', 'starts_at', 'ends_at', 'duty', 'status',
        'published_at', 'published_by', 'accepted_at', 'change_note', 'created_by',
    ];

    protected $casts = [
        'stock_location_id' => 'integer',
        'user_id' => 'integer',
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'published_at' => 'datetime',
        'accepted_at' => 'datetime',
        'published_by' => 'integer',
        'created_by' => 'integer',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @param Builder<Shift> $query */
    public function scopeLive(Builder $query): Builder
    {
        return $query->whereIn('status', self::LIVE);
    }

    /** Shifts the person can see: not drafts, not cancelled. @param Builder<Shift> $query */
    public function scopeSent(Builder $query): Builder
    {
        return $query->whereIn('status', [self::STATUS_PUBLISHED, self::STATUS_ACCEPTED, self::STATUS_CHANGE_REQUESTED]);
    }
}
