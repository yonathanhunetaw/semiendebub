<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One stretch at work: clocked in at a site, and out again. Only
 * App\Services\Workforce\AttendanceService writes these.
 */
class TimeEntry extends Model
{
    public const METHOD_QR = 'qr';

    /** Clocked in by opening the site. */
    public const METHOD_OPENING = 'opening';

    /** Clocked out by closing the site (the closer, and anyone they clocked out). */
    public const METHOD_CLOSING = 'closing';

    public const METHOD_MANAGER = 'manager';

    /** Closed by the sweep: nobody clocked out. */
    public const METHOD_AUTO = 'auto';

    public const FLAG_LATE = 'late';

    public const FLAG_EARLY_LEAVE = 'early_leave';

    public const FLAG_UNSCHEDULED = 'unscheduled';

    public const FLAG_AUTO_CLOSED = 'auto_closed';

    public const FLAG_FIXED = 'fixed';

    protected $fillable = [
        'user_id', 'stock_location_id', 'shift_id', 'clock_in_at', 'clock_out_at',
        'in_method', 'out_method', 'in_by', 'out_by', 'flags', 'note', 'reviewed_at', 'reviewed_by',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'stock_location_id' => 'integer',
        'shift_id' => 'integer',
        'clock_in_at' => 'datetime',
        'clock_out_at' => 'datetime',
        'reviewed_at' => 'datetime',
        'flags' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    /** @param Builder<TimeEntry> $query */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNull('clock_out_at');
    }

    public function hasFlag(string $flag): bool
    {
        return in_array($flag, $this->flags ?? [], true);
    }

    public function minutes(): ?int
    {
        return $this->clock_out_at === null ? null : (int) $this->clock_in_at->diffInMinutes($this->clock_out_at);
    }
}
