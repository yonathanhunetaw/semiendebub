<?php

declare(strict_types=1);

namespace App\Models\Finance;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line on a seller's balance: money received (positive, from a payment)
 * or handed over (negative, from a confirmed remittance). Written only by
 * App\Services\Finance\BalanceLedger.
 */
class BalanceEntry extends Model
{
    protected $table = 'balance_entries';

    protected $fillable = [
        'user_id',
        'payment_account_id',
        'payment_id',
        'remittance_id',
        'amount',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** Null for cash. */
    public function account(): BelongsTo
    {
        return $this->belongsTo(PaymentAccount::class, 'payment_account_id')->withTrashed();
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class, 'payment_id');
    }

    public function remittance(): BelongsTo
    {
        return $this->belongsTo(Remittance::class, 'remittance_id');
    }
}
