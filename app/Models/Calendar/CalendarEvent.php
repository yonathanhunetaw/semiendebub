<?php

declare(strict_types=1);

namespace App\Models\Calendar;

use App\Models\Auth\User;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * An entry someone put on the calendar: a reminder, a bill, a shift or a
 * meeting, once or repeating. Occurrences are worked out on the fly by
 * App\Services\Calendar\Recurrence; each one ticked off is a
 * CalendarEventCompletion.
 *
 * Who sees it: `private` is the creator's alone; `shared` is everyone whose
 * view covers its store, and with no store it is company-wide (everyone).
 */
class CalendarEvent extends Model
{
    public const KIND_REMINDER = 'reminder';

    public const KIND_BILL = 'bill';

    public const KIND_SHIFT = 'shift';

    public const KIND_MEETING = 'meeting';

    public const KINDS = [self::KIND_REMINDER, self::KIND_BILL, self::KIND_SHIFT, self::KIND_MEETING];

    public const VISIBILITY_PRIVATE = 'private';

    public const VISIBILITY_SHARED = 'shared';

    public const VISIBILITIES = [self::VISIBILITY_PRIVATE, self::VISIBILITY_SHARED];

    public const REPEAT_NONE = 'none';

    public const REPEAT_DAILY = 'daily';

    public const REPEAT_WEEKLY = 'weekly';

    public const REPEAT_MONTHLY = 'monthly';

    public const REPEAT_YEARLY = 'yearly';

    public const REPEATS = [self::REPEAT_NONE, self::REPEAT_DAILY, self::REPEAT_WEEKLY, self::REPEAT_MONTHLY, self::REPEAT_YEARLY];

    protected $table = 'calendar_events';

    protected $fillable = [
        'store_id',
        'created_by',
        'title',
        'notes',
        'kind',
        'visibility',
        'starts_at',
        'ends_at',
        'all_day',
        'repeat',
        'repeat_every',
        'repeat_until',
        'amount',
        'currency',
        'counterparty',
        'source_type',
        'source_id',
        'meta',
    ];

    protected $casts = [
        'starts_at' => 'immutable_datetime',
        'ends_at' => 'immutable_datetime',
        'all_day' => 'boolean',
        'repeat_every' => 'integer',
        'repeat_until' => 'immutable_date',
        'amount' => 'decimal:2',
        'meta' => 'array',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function completions(): HasMany
    {
        return $this->hasMany(CalendarEventCompletion::class);
    }

    /** What it came from (an uploaded receipt, later), if anything. */
    public function source(): MorphTo
    {
        return $this->morphTo();
    }

    public function repeats(): bool
    {
        return $this->repeat !== self::REPEAT_NONE;
    }

    /**
     * Entries this viewer may see.
     *
     * @param  array<int, int>|null  $storeIds  the viewer's stores; null means every store
     */
    public function scopeVisibleTo(Builder $query, User $viewer, ?array $storeIds): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->where('created_by', $viewer->id)
            ->orWhere(fn (Builder $shared) => $shared
                ->where('visibility', self::VISIBILITY_SHARED)
                ->when($storeIds !== null, fn (Builder $scoped) => $scoped->where(fn (Builder $store) => $store
                    ->whereNull('store_id')
                    ->when($storeIds !== [], fn (Builder $mine) => $mine->orWhereIn('store_id', $storeIds))))));
    }

    /** Entries that may have an occurrence between the two moments. */
    public function scopeAliveBetween(Builder $query, \DateTimeInterface $from, \DateTimeInterface $to): Builder
    {
        return $query
            ->where('starts_at', '<=', $to)
            ->where(fn (Builder $q) => $q
                // One-offs: they must touch the range.
                ->where(fn (Builder $once) => $once
                    ->where('repeat', self::REPEAT_NONE)
                    ->where(fn (Builder $end) => $end
                        ->where('starts_at', '>=', $from)
                        ->orWhere('ends_at', '>=', $from)))
                // Series: not finished before the range.
                ->orWhere(fn (Builder $series) => $series
                    ->where('repeat', '!=', self::REPEAT_NONE)
                    ->where(fn (Builder $until) => $until
                        ->whereNull('repeat_until')
                        ->orWhere('repeat_until', '>=', $from->format('Y-m-d')))));
    }
}
