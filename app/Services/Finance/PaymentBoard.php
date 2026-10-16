<?php

declare(strict_types=1);

namespace App\Services\Finance;

use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Auth\User;
use App\Models\Finance\Remittance;
use App\Models\Finance\Sale;
use App\Services\Admin\ActiveStore;
use Illuminate\Database\Eloquent\Builder;

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
     * Claimed parts waiting on this user to confirm them, oldest claim first.
     *
     * @return array<int, array<string, mixed>>
     */
    public function inbox(User $user, ?array $storeIds = null): array
    {
        return $this->awaiting($user)
            // The admin app narrows it to the store it is looking at (null = every store).
            ->when($storeIds !== null, fn (Builder $q) => $q->where(fn (Builder $w) => $w
                ->whereHas('sale', fn (Builder $sale) => $sale->whereIn('store_id', $storeIds))
                ->orWhere(fn (Builder $r) => $r->whereNull('sale_id')
                    ->whereHas('claimer', fn (Builder $claimer) => $claimer->whereIn('store_id', $storeIds)))))
            ->with(['account.owner', 'sale.customer', 'sale.store', 'customer', 'claimer'])
            ->orderBy('claimed_at')
            ->get()
            ->map(fn (Payment $payment): array => $this->part($payment) + [
                // A credit repayment has no order of its own.
                'order' => $payment->isRepayment() ? 'Credit repayment' : (string) ($payment->sale?->reference_number ?? ''),
                'order_total' => (float) ($payment->sale?->total_amount ?? $payment->amount),
                'customer' => ($payment->sale?->customer ?? $payment->customer)?->name ?? 'Walk-in customer',
                'store' => $payment->sale?->store?->name ?? $payment->account?->store?->name,
                'claimed_by' => $payment->claimer
                    ? trim($payment->claimer->first_name.' '.$payment->claimer->last_name)
                    : ($payment->claimed_via === Payment::CLAIMED_VIA_CUSTOMER ? 'The customer (shared cart)' : null),
            ])
            ->values()
            ->all();
    }

    /**
     * Deposits expected in this owner's accounts that nobody has marked
     * paid yet: they reach the owner as soon as the split is saved, so the
     * owner can confirm what already arrived without waiting for the seller.
     *
     * @return array<int, array<string, mixed>>
     */
    public function expectedInbox(User $user): array
    {
        return $this->expected($user)
            ->with(['account.owner', 'sale.customer', 'sale.store', 'customer', 'user'])
            ->orderBy('created_at')
            ->get()
            ->map(fn (Payment $payment): array => $this->part($payment) + [
                'order' => $payment->isRepayment() ? 'Credit repayment' : (string) ($payment->sale?->reference_number ?? ''),
                'order_total' => (float) ($payment->sale?->total_amount ?? $payment->amount),
                'customer' => ($payment->sale?->customer ?? $payment->customer)?->name ?? 'Walk-in customer',
                'store' => $payment->sale?->store?->name ?? $payment->account?->store?->name,
                'claimed_by' => null,
                'recorded_by' => $payment->user ? trim($payment->user->first_name.' '.$payment->user->last_name) : null,
                'expected' => true,
            ])
            ->values()
            ->all();
    }

    /**
     * Pending parts paid into $user's accounts, on orders whose payment can
     * still change, that someone else recorded (PaymentService::
     * mayConfirmEarly is the same rule, row by row).
     *
     * @return Builder<Payment>
     */
    public function expected(User $user): Builder
    {
        return Payment::query()
            ->where('status', Payment::STATUS_PENDING)
            ->whereHas('account', fn (Builder $account) => $account->where('owner_user_id', $user->id))
            ->where(fn (Builder $q) => $q->whereNull('user_id')->orWhere('user_id', '!=', $user->id))
            ->where(fn (Builder $q) => $q
                ->whereNull('sale_id')
                ->orWhereHas('sale', fn (Builder $sale) => $sale->whereIn('fulfillment_stage', [Sale::STAGE_AWAITING_PAYMENT, Sale::STAGE_PICK_PACK])));
    }

    /**
     * Deposits into $user's own accounts that $user recorded or claimed
     * themselves, so a second person has to confirm them (the two-person
     * rule). Shown read-only in the owner's inbox, with who can confirm, so
     * nothing waits out of sight.
     *
     * @return array<int, array<string, mixed>>
     */
    public function waitingOnOthers(User $user): array
    {
        $rows = Payment::query()
            ->whereHas('account', fn (Builder $account) => $account->where('owner_user_id', $user->id))
            ->where(fn (Builder $q) => $q
                ->where(fn (Builder $c) => $c->where('status', Payment::STATUS_CLAIMED)->where('claimed_by', $user->id))
                ->orWhere(fn (Builder $p) => $p->where('status', Payment::STATUS_PENDING)->where('user_id', $user->id)))
            ->where(fn (Builder $q) => $q
                ->whereNull('sale_id')
                ->orWhereHas('sale', fn (Builder $sale) => $sale->whereIn('fulfillment_stage', [Sale::STAGE_AWAITING_PAYMENT, Sale::STAGE_PICK_PACK])))
            ->with(['account.owner', 'sale.customer', 'sale.store', 'customer'])
            ->orderBy('created_at')
            ->get();

        // Who stands in at each store: its own admins and store managers.
        $storeIds = $rows->map(fn (Payment $p) => $p->sale?->store_id ?? $p->account?->store_id)->filter()->unique()->values();
        $standIns = User::query()
            ->whereIn('store_id', $storeIds)
            ->whereKeyNot($user->id)
            ->get()
            ->filter(fn (User $u): bool => $u->isRole('admin', 'store_manager'))
            ->groupBy('store_id')
            ->map(fn ($users) => $users->map(fn (User $u): string => trim($u->first_name.' '.$u->last_name))->values()->all());

        return $rows->map(function (Payment $payment) use ($standIns): array {
            $storeId = $payment->sale?->store_id ?? $payment->account?->store_id;

            return $this->part($payment) + [
                'order' => $payment->isRepayment() ? 'Credit repayment' : (string) ($payment->sale?->reference_number ?? ''),
                'order_total' => (float) ($payment->sale?->total_amount ?? $payment->amount),
                'customer' => ($payment->sale?->customer ?? $payment->customer)?->name ?? 'Walk-in customer',
                'store' => $payment->sale?->store?->name ?? $payment->account?->store?->name,
                // Store admins and managers by name; a global admin can always.
                'confirmers' => $standIns->get($storeId, []),
            ];
        })->values()->all();
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
        $user = User::query()->find($ownerId);

        return ($user ? $this->awaiting($user)->count() + $this->expected($user)->count() : 0)
            + Remittance::query()->awaitingOwner($ownerId)->count();
    }

    /**
     * Claimed parts waiting on $user as the second person: deposits into
     * their accounts, and, at stores they manage, cash and deposits the
     * account's own owner claimed. Never a part they claimed themselves
     * (PaymentService::mayConfirm is the same rule, row by row).
     *
     * @return Builder<Payment>
     */
    public function awaiting(User $user): Builder
    {
        $manager = $user->isRole('admin', 'store_manager');
        // Null is every store (a global admin).
        $managed = $manager ? ActiveStore::accessibleIdsFor($user) : [];

        return Payment::query()
            ->where('status', Payment::STATUS_CLAIMED)
            ->where(fn (Builder $q) => $q->whereNull('claimed_by')->orWhere('claimed_by', '!=', $user->id))
            ->where(function (Builder $q) use ($user, $manager, $managed): void {
                $q->whereHas('account', fn (Builder $account) => $account->where('owner_user_id', $user->id));

                if (! $manager) {
                    return;
                }

                $q->orWhere(function (Builder $standIn) use ($managed): void {
                    $standIn->where(fn (Builder $w) => $w->whereNull('payment_account_id')
                        ->orWhereHas('account', fn (Builder $account) => $account->whereColumn('owner_user_id', 'payments.claimed_by')));

                    if ($managed !== null) {
                        $standIn->where(fn (Builder $w) => $w
                            ->whereHas('sale', fn (Builder $sale) => $sale->whereIn('store_id', $managed))
                            ->orWhere(fn (Builder $r) => $r->whereNull('sale_id')
                                ->whereHas('claimer', fn (Builder $claimer) => $claimer->whereIn('store_id', $managed))));
                    }
                });
            });
    }
}
