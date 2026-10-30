<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One site on one date: who is to open and close it (and drive them), who did, and when.
 * Only App\Services\Workforce\SiteDayService changes `status`.
 */
class SiteDay extends Model
{
    public const STATUS_PLANNED = 'planned';

    public const STATUS_OPEN = 'open';

    public const STATUS_CLOSED = 'closed';

    /** Not opened by the opening time plus the site's grace. It can still be opened. */
    public const STATUS_MISSED = 'missed';

    /** The site's hours say closed that day (a weekday off or a holiday). */
    public const STATUS_CLOSED_DAY = 'closed_day';

    protected $fillable = [
        'stock_location_id', 'date', 'status', 'opener_id', 'closer_id', 'driver_id',
        'opened_at', 'opened_by', 'opened_without_key', 'no_driver', 'open_checklist', 'float_amount', 'open_note',
        'closed_at', 'closed_by', 'closed_late', 'close_checklist', 'till_count', 'close_note', 'missed_at',
        'cash_collected', 'cash_unconfirmed', 'cash_handed_over', 'cash_paid_out', 'cash_expected', 'till_difference', 'till_difference_note',
    ];

    protected $casts = [
        'stock_location_id' => 'integer',
        'date' => 'date',
        'opener_id' => 'integer',
        'closer_id' => 'integer',
        'driver_id' => 'integer',
        'opened_by' => 'integer',
        'closed_by' => 'integer',
        'opened_at' => 'datetime',
        'closed_at' => 'datetime',
        'missed_at' => 'datetime',
        'opened_without_key' => 'boolean',
        'no_driver' => 'boolean',
        'closed_late' => 'boolean',
        'open_checklist' => 'array',
        'close_checklist' => 'array',
        'float_amount' => 'decimal:2',
        'till_count' => 'decimal:2',
        'cash_collected' => 'decimal:2',
        'cash_unconfirmed' => 'decimal:2',
        'cash_handed_over' => 'decimal:2',
        'cash_paid_out' => 'decimal:2',
        'cash_expected' => 'decimal:2',
        'till_difference' => 'decimal:2',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }

    public function opener(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opener_id');
    }

    public function closer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closer_id');
    }

    /** Brings the opener in and takes the closer home (StaffRideService::planFor). */
    public function driver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function openedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    /** What the opener, closer and driver said: will they do it. */
    public function answers(): HasMany
    {
        return $this->hasMany(SiteDayAnswer::class);
    }

    public function isOpen(): bool
    {
        return $this->status === self::STATUS_OPEN;
    }
}
