<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One price a seller saw at one shop: for one pack (piece, packet or carton)
 * of `pieces_per_pack`, when buying at least `min_qty` packs. Someone other
 * than the recorder verifies or rejects it (PriceCheckService).
 */
class PriceObservation extends Model
{
    use HasFactory;

    public const PACK_TYPES = ['piece', 'packet', 'carton'];

    public const PENDING = 'pending';

    public const VERIFIED = 'verified';

    public const REJECTED = 'rejected';

    protected $fillable = [
        'price_check_id',
        'shop_id',
        'recorded_by',
        'observed_on',
        'pack_type',
        'pieces_per_pack',
        'min_qty',
        'price',
        'price_per_piece',
        'note',
        'verified_by',
        'verified_at',
        'rejected_by',
        'rejected_at',
        'reject_reason',
    ];

    protected $casts = [
        'observed_on' => 'date',
        'pieces_per_pack' => 'integer',
        'min_qty' => 'integer',
        'price' => 'decimal:2',
        'price_per_piece' => 'decimal:4',
        'verified_at' => 'datetime',
        'rejected_at' => 'datetime',
    ];

    public function check(): BelongsTo
    {
        return $this->belongsTo(PriceCheck::class, 'price_check_id');
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    public function state(): string
    {
        return match (true) {
            $this->verified_at !== null => self::VERIFIED,
            $this->rejected_at !== null => self::REJECTED,
            default => self::PENDING,
        };
    }

    public function scopeVerified(Builder $query): Builder
    {
        return $query->whereNotNull('verified_at');
    }

    /** Not rejected: pending or verified. */
    public function scopeStanding(Builder $query): Builder
    {
        return $query->whereNull('rejected_at');
    }
}
