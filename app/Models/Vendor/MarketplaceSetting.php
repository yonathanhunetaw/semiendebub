<?php

declare(strict_types=1);

namespace App\Models\Vendor;

use Illuminate\Database\Eloquent\Model;

/** The marketplace's rules a global admin changes in the app (one row): the commission rate. */
class MarketplaceSetting extends Model
{
    /** Until a global admin sets one. */
    public const DEFAULT_COMMISSION_PCT = 10.0;

    protected $fillable = ['commission_pct', 'updated_by'];

    protected $casts = ['commission_pct' => 'float'];

    public static function commissionPct(): float
    {
        return (float) (self::query()->value('commission_pct') ?? self::DEFAULT_COMMISSION_PCT);
    }
}
