<?php

namespace App\Models\Finance;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One part of an order's payment.
 *
 * An order's total may be split across several parts, each into one payment
 * account (or cash). A part moves pending → claimed (the customer says they
 * paid) → confirmed (the account's owner saw the money). "Not received yet"
 * puts a claimed part back to pending. A credit part is confirmed when it is
 * placed. A credit repayment is the same kind of row against a customer
 * rather than a sale. Only App\Services\Finance\PaymentService changes
 * `status`.
 */
class Payment extends Model
{
    use HasFactory;

    public const METHOD_BANK = 'bank';

    public const METHOD_WALLET = 'wallet';

    public const METHOD_CASH = 'cash';

    /** Put on the customer's credit: no money moves until they repay. */
    public const METHOD_CREDIT = 'credit';

    /** Part of an order's payment. */
    public const KIND_SALE = 'sale';

    /** A customer paying back credit; carries customer_id, no sale. */
    public const KIND_REPAYMENT = 'credit_repayment';

    public const STATUS_PENDING = 'pending';

    public const STATUS_CLAIMED = 'claimed';

    public const STATUS_CONFIRMED = 'confirmed';

    /** A part of an order that was cancelled before its money arrived. */
    public const STATUS_VOID = 'void';

    protected $table = 'payments';

    protected $fillable = [
        'sale_id',
        'kind',
        'customer_id',
        'payment_method',
        'payment_account_id',
        'amount',
        'currency',
        'transaction_reference',
        'status',
        'user_id',
        'paid_at',
        'claimed_at',
        'claimed_by',
        'confirmed_at',
        'confirmed_by',
        'rejected_at',
        'rejected_by',
        'notes',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'paid_at' => 'datetime',
        'claimed_at' => 'datetime',
        'confirmed_at' => 'datetime',
        'rejected_at' => 'datetime',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class, 'sale_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** Set on a credit repayment, which has no sale. */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /** Kept after the account is removed, so history still names it. */
    public function account(): BelongsTo
    {
        return $this->belongsTo(PaymentAccount::class, 'payment_account_id')->withTrashed();
    }

    public function claimer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'claimed_by');
    }

    public function confirmer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function scopeConfirmed(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_CONFIRMED);
    }

    /** Parts still counting towards the order: everything but voided ones. */
    public function scopeLive(Builder $query): Builder
    {
        return $query->where('status', '!=', self::STATUS_VOID);
    }

    /** Claimed parts waiting on this owner to check their account. */
    public function scopeAwaitingOwner(Builder $query, int $ownerId): Builder
    {
        return $query->where('status', self::STATUS_CLAIMED)
            ->whereHas('account', fn (Builder $account) => $account->where('owner_user_id', $ownerId));
    }

    public function isConfirmed(): bool
    {
        return $this->status === self::STATUS_CONFIRMED;
    }

    /** "CBE · 1000…" for an account, "Cash" otherwise. */
    public function label(): string
    {
        if ($this->account !== null) {
            return $this->account->label();
        }

        if ($this->payment_method === self::METHOD_CREDIT) {
            return 'On credit';
        }

        return ucfirst(str_replace('_', ' ', (string) $this->payment_method));
    }

    public function isRepayment(): bool
    {
        return $this->kind === self::KIND_REPAYMENT;
    }
}
