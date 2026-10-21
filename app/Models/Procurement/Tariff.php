<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * The government's tax rates for one HS code, as the owner keeps them. No
 * rate is built into the app: an HS code with no row here has no estimate.
 * How they stack is LandedCostEstimator's.
 */
class Tariff extends Model
{
    use HasFactory;

    public const RATES = ['duty_pct', 'excise_pct', 'vat_pct', 'surtax_pct', 'withholding_pct', 'other_pct'];

    protected $fillable = [
        'hs_code',
        'description',
        'duty_pct',
        'excise_pct',
        'vat_pct',
        'surtax_pct',
        'withholding_pct',
        'other_pct',
        'effective_from',
        'notes',
        'updated_by',
    ];

    protected $casts = [
        'duty_pct' => 'decimal:3',
        'excise_pct' => 'decimal:3',
        'vat_pct' => 'decimal:3',
        'surtax_pct' => 'decimal:3',
        'withholding_pct' => 'decimal:3',
        'other_pct' => 'decimal:3',
        'effective_from' => 'date',
    ];

    /** "8523.51.00" and "85235100" are the same code. */
    public static function normalise(?string $code): ?string
    {
        $code = $code !== null ? preg_replace('/[^0-9]/', '', $code) : null;

        return $code === '' ? null : $code;
    }

    public static function forCode(?string $code): ?self
    {
        $code = self::normalise($code);

        return $code === null ? null : self::query()->where('hs_code', $code)->first();
    }
}
