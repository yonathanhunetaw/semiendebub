<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A fleet car taking staff from a site, or bringing the day's opener to it.
 * Rides with a `purpose` are made from a site day's plan (its driver, opener
 * and closer). Only App\Services\Workforce\StaffRideService changes `status`.
 *
 * @property \Illuminate\Support\Carbon $departs_at
 */
class StaffRide extends Model
{
    public const STATUS_REQUESTED = 'requested';

    public const STATUS_CLAIMED = 'claimed';

    public const STATUS_DEPARTED = 'departed';

    public const STATUS_DONE = 'done';

    public const STATUS_CANCELLED = 'cancelled';

    public const OPEN = [self::STATUS_REQUESTED, self::STATUS_CLAIMED, self::STATUS_DEPARTED];

    /** Brings the opener from home to the site before opening. */
    public const PURPOSE_OPENING = 'opening';

    /** Takes the closer home after closing. */
    public const PURPOSE_CLOSING = 'closing';

    protected $fillable = [
        'stock_location_id', 'site_day_id', 'purpose', 'departs_at', 'status', 'driver_id', 'vehicle_id',
        'claimed_at', 'departed_at', 'finished_at', 'note', 'created_by',
    ];

    protected $casts = [
        'stock_location_id' => 'integer',
        'site_day_id' => 'integer',
        'driver_id' => 'integer',
        'vehicle_id' => 'integer',
        'created_by' => 'integer',
        'departs_at' => 'datetime',
        'claimed_at' => 'datetime',
        'departed_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }

    public function siteDay(): BelongsTo
    {
        return $this->belongsTo(SiteDay::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function riders(): HasMany
    {
        return $this->hasMany(StaffRideRider::class);
    }
}
