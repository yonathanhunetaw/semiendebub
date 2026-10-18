<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One person on a staff ride, and where they get off. */
class StaffRideRider extends Model
{
    public const STATUS_RIDING = 'riding';

    public const STATUS_DROPPED = 'dropped';

    public const STATUS_NO_SHOW = 'no_show';

    /** The rider said they do not need it. */
    public const STATUS_NOT_RIDING = 'not_riding';

    protected $fillable = ['staff_ride_id', 'user_id', 'drop_off', 'status', 'dropped_at'];

    protected $casts = [
        'staff_ride_id' => 'integer',
        'user_id' => 'integer',
        'dropped_at' => 'datetime',
    ];

    public function ride(): BelongsTo
    {
        return $this->belongsTo(StaffRide::class, 'staff_ride_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
