<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use Illuminate\Database\Eloquent\Model;

/**
 * The overtime rules (one row). Defaults follow the Ethiopian Labour
 * Proclamation 1156/2019: 8 normal hours a day; overtime ×1.5 by day, ×1.75
 * at night (22:00–06:00), ×2 on the weekly rest day, ×2.5 on a public holiday.
 * A global admin changes them (OvertimeService).
 */
class OvertimeSetting extends Model
{
    protected $fillable = [
        'daily_minutes', 'rate_day', 'rate_night', 'rate_rest_day', 'rate_holiday',
        'night_from', 'night_to', 'rest_weekday', 'needs_approval', 'updated_by',
    ];

    protected $casts = [
        'daily_minutes' => 'integer',
        'rate_day' => 'float',
        'rate_night' => 'float',
        'rate_rest_day' => 'float',
        'rate_holiday' => 'float',
        'rest_weekday' => 'integer',
        'needs_approval' => 'boolean',
    ];
}
