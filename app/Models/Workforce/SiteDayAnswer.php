<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The opener's, closer's or driver's answer to their duty on a site day:
 * "yes", or "no" with a reason. Naming someone else for the duty clears it.
 */
class SiteDayAnswer extends Model
{
    public const DUTIES = ['opener', 'closer', 'driver'];

    public const YES = 'yes';

    public const NO = 'no';

    protected $fillable = ['site_day_id', 'duty', 'user_id', 'answer', 'note'];

    protected $casts = [
        'site_day_id' => 'integer',
        'user_id' => 'integer',
    ];

    public function siteDay(): BelongsTo
    {
        return $this->belongsTo(SiteDay::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
