<?php

declare(strict_types=1);

namespace App\Services\Procurement;

use App\Exceptions\PurchaseOrderException;
use App\Models\Auth\User;
use App\Models\Procurement\PayableInstallment;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\SupplierPayable;
use App\Models\Procurement\SupplierPayment;
use Illuminate\Support\Facades\DB;

/**
 * Paying suppliers, with two people, like PaymentService for sales:
 *
 *   procurement records a payment it made (claimed) ──▶ a global admin or finance confirms it
 *                                                    └▶ or rejects it (it never counts)
 *
 * Whoever recorded a payment never confirms it. Each payment keeps the rate
 * actually paid, so its ETB is what really left the bank.
 */
class SupplierPaymentService
{
    /** Order statuses money may go out on: approved and later, not cancelled. */
    public const PAYABLE_STATUSES = [
        Purchase::STATUS_APPROVED,
        Purchase::STATUS_ORDERED,
        Purchase::STATUS_PARTIALLY_RECEIVED,
        Purchase::STATUS_RECEIVED,
        Purchase::STATUS_CLOSED,
    ];

    public function __construct(private readonly PayablesLedger $ledger)
    {
    }

    /**
     * Record a payment made against one installment.
     *
     * @param  array{amount: float|string, exchange_rate?: float|string|null, paid_on: string, method: string, payment_account_id?: int|null, reference?: string|null, notes?: string|null}  $data
     */
    public function record(PayableInstallment $installment, array $data, User $by): SupplierPayment
    {
        if (! self::mayRecord($by)) {
            throw new PurchaseOrderException('Only procurement or a global admin records supplier payments.', 403);
        }

        return DB::transaction(function () use ($installment, $data, $by): SupplierPayment {
            $installment = PayableInstallment::query()->lockForUpdate()->findOrFail($installment->id);
            $payable = SupplierPayable::query()->with('payable')->findOrFail($installment->supplier_payable_id);
            $installment->setRelation('supplierPayable', $payable);

            if ($payable->cancelled_at !== null) {
                throw new PurchaseOrderException('This order was cancelled: nothing more is paid on it.');
            }

            $owner = $payable->payable;

            if ($owner instanceof Purchase && ! in_array($owner->status, self::PAYABLE_STATUSES, true)) {
                throw new PurchaseOrderException('Pay an order only once it is approved.');
            }

            $amount = round((float) $data['amount'], 2);
            $open = $this->ledger->installment($installment)['payable_now'];

            if ($amount <= 0) {
                throw new PurchaseOrderException('Enter the amount paid.');
            }

            if ($amount > $open) {
                throw new PurchaseOrderException(sprintf(
                    'Only %s %s is left to record on %s (payments waiting for confirmation count too).',
                    $payable->currency,
                    number_format($open, 2),
                    $installment->label,
                ));
            }

            $home = (string) config('procurement.home_currency', 'ETB');
            $rate = $payable->currency === $home ? 1.0 : (float) ($data['exchange_rate'] ?? 0);

            if ($rate <= 0) {
                throw new PurchaseOrderException('Enter the exchange rate the bank used.');
            }

            return SupplierPayment::query()->create([
                'supplier_payable_id' => $payable->id,
                'payable_installment_id' => $installment->id,
                'currency' => $payable->currency,
                'amount' => $amount,
                'exchange_rate' => $rate,
                'amount_etb' => round($amount * $rate, 2),
                'paid_on' => $data['paid_on'],
                'method' => $data['method'],
                'payment_account_id' => $data['payment_account_id'] ?? null,
                'reference' => $data['reference'] ?? null,
                'notes' => $data['notes'] ?? null,
                'status' => SupplierPayment::STATUS_CLAIMED,
                'claimed_by' => $by->id,
                'claimed_at' => now(),
            ]);
        });
    }

    /** The second person checked it left the account: it now counts as paid. */
    public function confirm(SupplierPayment $payment, User $by): SupplierPayment
    {
        return DB::transaction(function () use ($payment, $by): SupplierPayment {
            $payment = $this->claimedFor($payment, $by);

            $payment->forceFill([
                'status' => SupplierPayment::STATUS_CONFIRMED,
                'confirmed_by' => $by->id,
                'confirmed_at' => now(),
            ])->save();

            return $payment;
        });
    }

    /** It did not go out (or not like this): it never counts. */
    public function reject(SupplierPayment $payment, User $by, string $reason): SupplierPayment
    {
        return DB::transaction(function () use ($payment, $by, $reason): SupplierPayment {
            $payment = $this->claimedFor($payment, $by);

            $payment->forceFill([
                'status' => SupplierPayment::STATUS_REJECTED,
                'rejected_by' => $by->id,
                'rejected_at' => now(),
                'reject_reason' => $reason,
            ])->save();

            return $payment;
        });
    }

    public static function mayRecord(User $by): bool
    {
        return $by->isRole('procurement') || self::isGlobalAdmin($by);
    }

    /** May $by be the second person on this payment? */
    public static function mayConfirm(SupplierPayment $payment, User $by): bool
    {
        return (int) $payment->claimed_by !== (int) $by->id
            && ($by->isRole('finance') || self::isGlobalAdmin($by));
    }

    private static function isGlobalAdmin(User $user): bool
    {
        return $user->isRole('admin') && $user->store_id === null;
    }

    private function claimedFor(SupplierPayment $payment, User $by): SupplierPayment
    {
        $payment = SupplierPayment::query()->lockForUpdate()->findOrFail($payment->id);

        if ((int) $payment->claimed_by === (int) $by->id) {
            throw new PurchaseOrderException('You recorded this payment yourself. A second person has to confirm it.', 403);
        }

        if (! self::mayConfirm($payment, $by)) {
            throw new PurchaseOrderException('Only finance or a global admin confirms supplier payments.', 403);
        }

        if ($payment->status !== SupplierPayment::STATUS_CLAIMED) {
            throw new PurchaseOrderException('This payment is not waiting for confirmation.');
        }

        return $payment;
    }
}
