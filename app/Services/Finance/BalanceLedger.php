<?php

declare(strict_types=1);

namespace App\Services\Finance;

use App\Models\Finance\BalanceEntry;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Remittance;
use Illuminate\Support\Carbon;

/**
 * A seller's balance: the money they hold for the company.
 *
 * It is the sum of balance_entries, kept per bucket: one per account the
 * money landed in, plus cash. A confirmed payment adds an entry for the
 * seller who confirmed it; a confirmed remittance subtracts what was handed
 * over. Nothing else writes entries, and no balance is stored.
 *
 * Money in a remittance still waiting on its settlement owner stays on the
 * balance but cannot be handed over a second time ("handing over").
 */
class BalanceLedger
{
    /** The money a confirmed payment put in its confirmer's hands. Idempotent. */
    public function recordPayment(Payment $payment): void
    {
        if ($payment->status !== Payment::STATUS_CONFIRMED || $payment->confirmed_by === null) {
            return;
        }

        BalanceEntry::query()->firstOrCreate(['payment_id' => $payment->id], [
            'user_id' => $payment->confirmed_by,
            'payment_account_id' => $payment->payment_account_id,
            'amount' => $payment->amount,
        ]);
    }

    /** A confirmed handover leaves the seller's balance. Idempotent. */
    public function recordRemittance(Remittance $remittance): void
    {
        if ($remittance->status !== Remittance::STATUS_CONFIRMED) {
            return;
        }

        BalanceEntry::query()->firstOrCreate(['remittance_id' => $remittance->id], [
            'user_id' => $remittance->user_id,
            'payment_account_id' => $remittance->from_payment_account_id,
            'amount' => -1 * (float) $remittance->amount,
        ]);
    }

    /** Everything this seller holds, in cents. */
    public function heldCents(int $userId): int
    {
        return $this->cents(BalanceEntry::query()->where('user_id', $userId)->sum('amount'));
    }

    /**
     * What this seller can still hand over from one bucket (null = cash):
     * held, less handovers waiting on their settlement owner.
     */
    public function availableCents(int $userId, ?int $accountId): int
    {
        $held = BalanceEntry::query()->where('user_id', $userId)
            ->where(fn ($q) => $accountId === null ? $q->whereNull('payment_account_id') : $q->where('payment_account_id', $accountId))
            ->sum('amount');

        $pending = Remittance::query()->where('user_id', $userId)->where('status', Remittance::STATUS_CLAIMED)
            ->where(fn ($q) => $accountId === null ? $q->whereNull('from_payment_account_id') : $q->where('from_payment_account_id', $accountId))
            ->sum('amount');

        return $this->cents($held) - $this->cents($pending);
    }

    /**
     * The seller's buckets, accounts first then cash, each with what is held,
     * what is being handed over, and what is left to hand over.
     *
     * @return array<int, array<string, mixed>>
     */
    public function buckets(int $userId): array
    {
        $held = BalanceEntry::query()->where('user_id', $userId)
            ->selectRaw('payment_account_id, SUM(amount) as total')
            ->groupBy('payment_account_id')
            ->pluck('total', 'payment_account_id');

        $pending = Remittance::query()->where('user_id', $userId)->where('status', Remittance::STATUS_CLAIMED)
            ->selectRaw('from_payment_account_id, SUM(amount) as total')
            ->groupBy('from_payment_account_id')
            ->pluck('total', 'from_payment_account_id');

        // pluck() keys a null account as "" — that is the cash bucket.
        $keys = $held->keys()->merge($pending->keys())->unique();
        $accounts = PaymentAccount::withTrashed()->with('owner')
            ->whereKey($keys->filter(fn ($key) => $key !== '' && $key !== null)->all())
            ->get()->keyBy('id');
        $board = app(PaymentBoard::class);

        return $keys
            ->map(function ($key) use ($held, $pending, $accounts, $board): array {
                $account = ($key === '' || $key === null) ? null : $accounts->get((int) $key);
                $heldCents = $this->cents($held->get($key, 0));
                $pendingCents = $this->cents($pending->get($key, 0));

                return [
                    'account' => $account ? $board->account($account) : null,
                    'held' => $heldCents / 100,
                    'handing_over' => $pendingCents / 100,
                    'available' => ($heldCents - $pendingCents) / 100,
                ];
            })
            ->filter(fn (array $bucket): bool => $bucket['held'] != 0 || $bucket['handing_over'] != 0)
            ->sortBy(fn (array $bucket): string => $bucket['account'] === null ? 'zz' : $bucket['account']['provider_name'].$bucket['account']['account_number'])
            ->values()
            ->all();
    }

    /**
     * Cash held longer than payments.cash_flag_days.
     *
     * Handovers pay off the oldest cash first, so what is left of the oldest
     * cash entries is what has been held longest.
     *
     * @return array{amount: float, since: string|null, days: int}
     */
    public function overdueCash(int $userId): array
    {
        $days = (int) config('payments.cash_flag_days', 3);
        $cutoff = now()->subDays($days);

        $entries = BalanceEntry::query()->where('user_id', $userId)->whereNull('payment_account_id')
            ->orderBy('created_at')->orderBy('id')->get(['amount', 'created_at']);

        $handedOver = -1 * $this->cents($entries->where('amount', '<', 0)->sum('amount'));
        $overdue = 0;
        $since = null;

        foreach ($entries->where('amount', '>', 0) as $entry) {
            $left = $this->cents($entry->amount);
            $covered = min($left, $handedOver);
            $handedOver -= $covered;
            $left -= $covered;

            if ($left > 0 && $entry->created_at instanceof Carbon && $entry->created_at->lt($cutoff)) {
                $overdue += $left;
                $since ??= $entry->created_at->toIso8601String();
            }
        }

        return ['amount' => $overdue / 100, 'since' => $since, 'days' => $days];
    }

    /**
     * The newest lines on a seller's balance.
     *
     * @return array<int, array<string, mixed>>
     */
    public function entries(int $userId, int $limit = 50): array
    {
        return BalanceEntry::query()->where('user_id', $userId)
            ->with(['account', 'payment.sale', 'payment.customer', 'remittance.to'])
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (BalanceEntry $entry): array => [
                'id' => (int) $entry->id,
                'amount' => (float) $entry->amount,
                'bucket' => $entry->account?->label() ?? 'Cash',
                'what' => $entry->remittance_id !== null
                    ? 'Handed over to '.($entry->remittance?->to?->label() ?? 'settlement')
                    : ($entry->payment?->isRepayment()
                        ? 'Credit repaid by '.($entry->payment->customer?->name ?? 'a customer')
                        : 'Received for '.($entry->payment?->sale?->reference_number ?? 'a payment')),
                'at' => $entry->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();
    }

    private function cents(mixed $amount): int
    {
        return (int) round(((float) $amount) * 100);
    }
}
