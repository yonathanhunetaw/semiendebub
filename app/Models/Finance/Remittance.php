<?php

declare(strict_types=1);

namespace App\Models\Finance;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A seller handing money they hold over to a settlement account.
 *
 * Starts claimed; the settlement account's owner confirms it (the amount
 * leaves the seller's balance) or rejects it (it stays). Only
 * App\Services\Finance\RemittanceService changes `status`.
 */
class Remittance extends Model
{
    public const STATUS_CLAIMED = 'claimed';

    public const STATUS_CONFIRMED = 'confirmed';

    public const STATUS_REJECTED = 'rejected';

    protected $table = 'remittances';

    protected $fillable = [
        'user_id',
        'from_payment_account_id',
        'to_payment_account_id',
        'amount',
        'reference',
        'status',
        'confirmed_at',
        'confirmed_by',
        'rejected_at',
        'rejected_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'confirmed_at' => 'datetime',
        'rejected_at' => 'datetime',
    ];

    /** The seller handing the money over. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** Null when handing over cash. */
    public function from(): BelongsTo
    {
        return $this->belongsTo(PaymentAccount::class, 'from_payment_account_id')->withTrashed();
    }

    public function to(): BelongsTo
    {
        return $this->belongsTo(PaymentAccount::class, 'to_payment_account_id')->withTrashed();
    }

    /** Handovers waiting on this owner to check their settlement account. */
    public function scopeAwaitingOwner(Builder $query, int $ownerId): Builder
    {
        return $query->where('status', self::STATUS_CLAIMED)
            ->whereHas('to', fn (Builder $account) => $account->where('owner_user_id', $ownerId));
    }
}
