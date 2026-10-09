<?php

declare(strict_types=1);

namespace App\Services\Finance;

use App\Exceptions\PaymentException;
use App\Models\Auth\User;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Remittance;
use Illuminate\Support\Facades\DB;

/**
 * Handing held money over to a settlement account.
 *
 *   remit    the seller sends money from one bucket (an account they took
 *            deposits in, or cash) to a settlement account the admin
 *            assigned them. It waits on that account's owner.
 *   confirm  the owner saw it arrive: it leaves the seller's balance.
 *   reject   it did not arrive: it stays on the seller's balance.
 *
 * Nobody hands money to themselves: a seller cannot remit to an account they
 * own, so the confirmer is never the remitter. A confirmed remittance is the
 * end of the line; it does not land on the settlement owner's balance.
 */
class RemittanceService
{
    public function __construct(private readonly BalanceLedger $ledger)
    {
    }

    /** @throws PaymentException */
    public function remit(User $by, ?int $fromAccountId, int $toAccountId, float $amount, ?string $reference = null): Remittance
    {
        return DB::transaction(function () use ($by, $fromAccountId, $toAccountId, $amount, $reference): Remittance {
            // One handover at a time per seller, so two cannot spend the same money.
            User::query()->whereKey($by->id)->lockForUpdate()->first();

            $to = PaymentAccount::query()->whereKey($toAccountId)->first();

            if ($to === null || $to->purpose !== PaymentAccount::PURPOSE_SETTLEMENT || ! $to->is_active
                || ! $to->remitters()->whereKey($by->id)->exists()) {
                throw new PaymentException('That is not a settlement account you hand money over to.');
            }

            if ((int) $to->owner_user_id === (int) $by->id) {
                throw new PaymentException('You own that account. Hand the money over to someone else.');
            }

            $cents = (int) round($amount * 100);
            $available = $this->ledger->availableCents((int) $by->id, $fromAccountId);

            if ($cents <= 0) {
                throw new PaymentException('Hand over an amount above zero.');
            }

            if ($cents > $available) {
                throw new PaymentException(sprintf('You can hand over at most %s ETB from there.', number_format(max(0, $available) / 100, 2)));
            }

            return Remittance::create([
                'user_id' => $by->id,
                'from_payment_account_id' => $fromAccountId,
                'to_payment_account_id' => $to->id,
                'amount' => $cents / 100,
                'reference' => $reference,
                'status' => Remittance::STATUS_CLAIMED,
            ]);
        });
    }

    /** @throws PaymentException */
    public function confirm(Remittance $remittance, User $by): Remittance
    {
        return DB::transaction(function () use ($remittance, $by): Remittance {
            $remittance = $this->claimedFor($remittance, $by);

            $remittance->update([
                'status' => Remittance::STATUS_CONFIRMED,
                'confirmed_at' => now(),
                'confirmed_by' => $by->id,
            ]);

            $this->ledger->recordRemittance($remittance);

            return $remittance;
        });
    }

    /** @throws PaymentException */
    public function reject(Remittance $remittance, User $by): Remittance
    {
        return DB::transaction(function () use ($remittance, $by): Remittance {
            $remittance = $this->claimedFor($remittance, $by);

            $remittance->update([
                'status' => Remittance::STATUS_REJECTED,
                'rejected_at' => now(),
                'rejected_by' => $by->id,
            ]);

            return $remittance;
        });
    }

    /** @throws PaymentException */
    private function claimedFor(Remittance $remittance, User $by): Remittance
    {
        $remittance = Remittance::query()->with('to')->lockForUpdate()->findOrFail($remittance->id);

        if ((int) ($remittance->to?->owner_user_id ?? 0) !== (int) $by->id || (int) $remittance->user_id === (int) $by->id) {
            throw new PaymentException('Only the owner of the settlement account can confirm what arrived in it.', 403);
        }

        if ($remittance->status !== Remittance::STATUS_CLAIMED) {
            throw new PaymentException('This handover is not waiting for you to check it.');
        }

        return $remittance;
    }
}
