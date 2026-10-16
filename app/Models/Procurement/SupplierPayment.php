<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Auth\User;
use App\Models\Finance\PaymentAccount;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Money sent to a supplier against one installment. Recorded (claimed) by
 * one person, confirmed or rejected by another (SupplierPaymentService).
 * `exchange_rate` is the rate actually paid; `amount_etb` what left the bank.
 */
class SupplierPayment extends Model
{
    public const STATUS_CLAIMED = 'claimed';

    public const STATUS_CONFIRMED = 'confirmed';

    public const STATUS_REJECTED = 'rejected';

    public const METHODS = ['bank_transfer', 'swift', 'wallet', 'cash', 'other'];

    protected $fillable = [
        'supplier_payable_id',
        'payable_installment_id',
        'currency',
        'amount',
        'exchange_rate',
        'amount_etb',
        'paid_on',
        'method',
        'payment_account_id',
        'reference',
        'notes',
        'status',
        'claimed_by',
        'claimed_at',
        'confirmed_by',
        'confirmed_at',
        'rejected_by',
        'rejected_at',
        'reject_reason',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'exchange_rate' => 'decimal:6',
        'amount_etb' => 'decimal:2',
        'paid_on' => 'date',
        'claimed_at' => 'datetime',
        'confirmed_at' => 'datetime',
        'rejected_at' => 'datetime',
    ];

    public function supplierPayable(): BelongsTo
    {
        return $this->belongsTo(SupplierPayable::class);
    }

    public function installment(): BelongsTo
    {
        return $this->belongsTo(PayableInstallment::class, 'payable_installment_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(PaymentAccount::class, 'payment_account_id');
    }

    public function claimer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'claimed_by');
    }

    public function confirmer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function rejecter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }
}
