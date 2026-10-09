<?php

declare(strict_types=1);

namespace App\Services\Finance;

use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Remittance;

/**
 * The read side of payments, shaped for the seller screens: the accounts a
 * seller may split an order across, an order's parts, and an owner's inbox
 * of deposits and handovers waiting for them to check their account.
 *
 * Types: resources/js/types/payments.ts.
 */
class PaymentBoard
{
    /**
     * Active collection accounts at a store, banks before wallets.
     *
     * @return array<int, array<string, mixed>>
     */
    public function accountsFor(?int $storeId): array
    {
        if ($storeId === null) {
            return [];
        }

        return PaymentAccount::query()
            ->collectingFor($storeId)
            ->with('owner')
            ->orderBy('type')
            ->orderBy('provider')
            ->orderBy('id')
            ->get()
            ->map(fn (PaymentAccount $account): array => $this->account($account))
            ->values()
            ->all();
    }

    /** @return array<string, mixed> */
    public function account(PaymentAccount $account): array
    {
        return [
            'id' => (int) $account->id,
            'type' => (string) $account->type,
            'provider' => (string) $account->provider,
            'provider_name' => $account->providerName(),
            'account_number' => (string) $account->account_number,
            'account_name' => (string) $account->account_name,
            'owner' => $account->owner ? trim($account->owner->first_name.' '.$account->owner->last_name) : null,
        ];
    }

    /**
     * One part of an order, as the To pay screen shows it.
     *
     * @return array<string, mixed>
     */
    public function part(Payment $payment): array
    {
        return [
            'id' => (int) $payment->id,
            'method' => (string) $payment->payment_method,
            'account' => $payment->account ? $this->account($payment->account) : null,
            'amount' => (float) $payment->amount,
            'reference' => $payment->transaction_reference,
            'status' => (string) $payment->status,
            'claimed_at' => $payment->claimed_at?->toIso8601String(),
            'confirmed_at' => $payment->confirmed_at?->toIso8601String(),
            // Set while the part is back at pending because the owner could
            // not find the money.
            'not_received_at' => $payment->status === Payment::STATUS_PENDING ? $payment->rejected_at?->toIso8601String() : null,
            'created_at' => $payment->created_at?->toIso8601String(),
        ];
    }

    /**
     * Claimed parts paid into this owner's accounts, oldest claim first.
     *
     * @return array<int, array<string, mixed>>
     */
    public function inbox(int $ownerId): array
    {
        return Payment::query()
            ->awaitingOwner($ownerId)
            ->with(['account.owner', 'sale.customer', 'sale.store', 'customer', 'claimer'])
            ->orderBy('claimed_at')
            ->get()
            ->map(fn (Payment $payment): array => $this->part($payment) + [
                // A credit repayment has no order of its own.
                'order' => $payment->isRepayment() ? 'Credit repayment' : (string) ($payment->sale?->reference_number ?? ''),
                'order_total' => (float) ($payment->sale?->total_amount ?? $payment->amount),
                'customer' => ($payment->sale?->customer ?? $payment->customer)?->name ?? 'Walk-in customer',
                'store' => $payment->sale?->store?->name ?? $payment->account?->store?->name,
                'claimed_by' => $payment->claimer ? trim($payment->claimer->first_name.' '.$payment->claimer->last_name) : null,
            ])
            ->values()
            ->all();
    }

    /**
     * Handovers sent to this owner's settlement accounts, oldest first.
     *
     * @return array<int, array<string, mixed>>
     */
    public function handoverInbox(int $ownerId): array
    {
        return Remittance::query()
            ->awaitingOwner($ownerId)
            ->with(['user', 'from', 'to.owner'])
            ->orderBy('created_at')
            ->get()
            ->map(fn (Remittance $remittance): array => $this->remittance($remittance))
            ->values()
            ->all();
    }

    /** @return array<string, mixed> */
    public function remittance(Remittance $remittance): array
    {
        return [
            'id' => (int) $remittance->id,
            'amount' => (float) $remittance->amount,
            'from' => $remittance->from?->label() ?? 'Cash',
            'to' => $remittance->to ? $this->account($remittance->to) : null,
            'reference' => $remittance->reference,
            'status' => (string) $remittance->status,
            'by' => $remittance->user ? trim($remittance->user->first_name.' '.$remittance->user->last_name) : null,
            'at' => $remittance->created_at?->toIso8601String(),
            'settled_at' => ($remittance->confirmed_at ?? $remittance->rejected_at)?->toIso8601String(),
        ];
    }

    /** Deposits and handovers waiting on this owner: the More hub badge. */
    public function inboxCount(int $ownerId): int
    {
        return Payment::query()->awaitingOwner($ownerId)->count()
            + Remittance::query()->awaitingOwner($ownerId)->count();
    }
}
