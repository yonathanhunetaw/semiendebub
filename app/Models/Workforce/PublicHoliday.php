<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use Illuminate\Database\Eloquent\Model;

/** A public holiday: any work that day is overtime at the holiday rate. */
class PublicHoliday extends Model
{
    protected $fillable = ['date', 'name'];

    protected $casts = ['date' => 'date'];
}
