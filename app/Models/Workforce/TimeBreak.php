<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A break inside a clock-in. Worked time leaves it out (AttendanceService). */
class TimeBreak extends Model
{
    protected $fillable = ['time_entry_id', 'started_at', 'ended_at'];

    protected $casts = [
        'time_entry_id' => 'integer',
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function entry(): BelongsTo
    {
        return $this->belongsTo(TimeEntry::class, 'time_entry_id');
    }
}
