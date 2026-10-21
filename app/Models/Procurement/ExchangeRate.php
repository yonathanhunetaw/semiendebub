<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ETB for one unit of a currency, as procurement last set it. Each change is
 * a new row, so the history stays; the newest row per currency is the rate.
 */
class ExchangeRate extends Model
{
    protected $fillable = ['currency', 'rate', 'set_by'];

    protected $casts = [
        'rate' => 'decimal:4',
    ];

    public function setter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'set_by');
    }

    /** The latest rate for a currency; ETB is always 1; null when never set. */
    public static function latestFor(string $currency): ?float
    {
        if ($currency === config('procurement.home_currency', 'ETB')) {
            return 1.0;
        }

        $rate = self::query()->where('currency', $currency)->latest('id')->value('rate');

        return $rate !== null ? (float) $rate : null;
    }
}
