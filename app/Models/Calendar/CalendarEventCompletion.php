<?php

declare(strict_types=1);

namespace App\Models\Calendar;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * One occurrence of a calendar entry ticked off: the bill of the 16th paid,
 * the shift of Tuesday worked. Keyed by the day the occurrence falls on.
 *
 * Ticking a bill here is a note on the calendar, not money: payments still
 * go through App\Services\Finance\PaymentService and its two-person rule.
 */
class CalendarEventCompletion extends Model
{
    protected $table = 'calendar_event_completions';

    protected $fillable = [
        'calendar_event_id',
        'occurs_on',
        'completed_at',
        'completed_by',
        'amount',
        'note',
        'source_type',
        'source_id',
    ];

    protected $casts = [
        'occurs_on' => 'immutable_date',
        'completed_at' => 'immutable_datetime',
        'amount' => 'decimal:2',
    ];

    public function event(): BelongsTo
    {
        return $this->belongsTo(CalendarEvent::class, 'calendar_event_id');
    }

    public function completer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'completed_by');
    }

    /** What proves it (an uploaded receipt, later), if anything. */
    public function source(): MorphTo
    {
        return $this->morphTo();
    }
}
