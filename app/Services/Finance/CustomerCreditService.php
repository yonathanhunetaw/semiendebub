<?php

declare(strict_types=1);

namespace App\Services\Finance;

use App\Models\Auth\Customer;
use App\Models\Finance\Payment;
use App\Models\Finance\Sale;

/**
 * What a customer owes on credit, and whether they may buy on credit now.
 *
 * Owed = confirmed credit parts on their orders − confirmed repayments. Each
 * order with a credit part is an invoice due on its sale's due_date;
 * repayments pay off the oldest invoice first, and what is left of an invoice
 * past its due date is overdue. An overdue customer cannot put more on credit
 * unless an admin set credit_override. Nothing here is stored: it is all
 * read from payments.
 */
class CustomerCreditService
{
    public function outstandingCents(int $customerId): int
    {
        return max(0, $this->chargedCents($customerId) - $this->repaidCents($customerId));
    }

    /** What is left of the limit, never below zero. */
    public function availableCents(Customer $customer): int
    {
        if (! $customer->hasCredit()) {
            return 0;
        }

        return max(0, $this->cents($customer->credit_limit) - $this->outstandingCents((int) $customer->id));
    }

    /**
     * Credit orders with what is still owed on each, oldest first, after
     * repayments are applied oldest-first.
     *
     * @return array<int, array{sale_id: int, reference: string, charged: float, owed: float, due_date: string|null, overdue: bool}>
     */
    public function invoices(int $customerId): array
    {
        $charges = Payment::query()
            ->where('kind', Payment::KIND_SALE)
            ->where('payment_method', Payment::METHOD_CREDIT)
            ->where('status', Payment::STATUS_CONFIRMED)
            ->whereHas('sale', fn ($q) => $q->where('customer_id', $customerId))
            ->selectRaw('sale_id, SUM(amount) as total')
            ->groupBy('sale_id')
            ->pluck('total', 'sale_id');

        $sales = Sale::query()->whereKey($charges->keys()->all())
            ->orderByRaw('due_date IS NULL')
            ->orderBy('due_date')
            ->orderBy('id')
            ->get(['id', 'reference_number', 'due_date']);

        $repaid = $this->repaidCents($customerId);
        $today = now()->startOfDay();

        return $sales->map(function (Sale $sale) use ($charges, &$repaid, $today): array {
            $charged = $this->cents($charges->get($sale->id, 0));
            $covered = min($charged, $repaid);
            $repaid -= $covered;
            $owed = $charged - $covered;

            return [
                'sale_id' => (int) $sale->id,
                'reference' => (string) $sale->reference_number,
                'charged' => $charged / 100,
                'owed' => $owed / 100,
                'due_date' => $sale->due_date?->toDateString(),
                'overdue' => $owed > 0 && $sale->due_date !== null && $sale->due_date->lt($today),
            ];
        })->values()->all();
    }

    /**
     * Owed past its due date.
     *
     * @return array{amount: float, oldest_due: string|null}
     */
    public function overdue(int $customerId): array
    {
        $late = collect($this->invoices($customerId))->where('overdue', true);

        return [
            'amount' => round((float) $late->sum('owed'), 2),
            'oldest_due' => $late->first()['due_date'] ?? null,
        ];
    }

    /** Overdue and not let off by an admin: no new credit. */
    public function isBlocked(Customer $customer): bool
    {
        return ! $customer->credit_override && $this->overdue((int) $customer->id)['amount'] > 0;
    }

    /**
     * The customer's credit as the seller and admin screens show it.
     *
     * @return array<string, mixed>|null null when they have no credit and owe nothing
     */
    public function summary(Customer $customer): ?array
    {
        $outstanding = $this->outstandingCents((int) $customer->id);

        if (! $customer->hasCredit() && $outstanding === 0) {
            return null;
        }

        $overdue = $this->overdue((int) $customer->id);
        $blocked = $this->isBlocked($customer);

        return [
            'customer_id' => (int) $customer->id,
            'enabled' => $customer->hasCredit(),
            'limit' => (float) $customer->credit_limit,
            'days' => (int) $customer->credit_days,
            'outstanding' => $outstanding / 100,
            'available' => $this->availableCents($customer) / 100,
            'overdue' => $overdue['amount'],
            'oldest_due' => $overdue['oldest_due'],
            'override' => (bool) $customer->credit_override,
            // Why "Add to credit" is not offered, or null when it is.
            'blocked_reason' => ! $customer->hasCredit()
                ? 'This customer has no credit.'
                : ($blocked ? 'This customer has an overdue credit invoice.' : null),
        ];
    }

    private function chargedCents(int $customerId): int
    {
        return $this->cents(Payment::query()
            ->where('kind', Payment::KIND_SALE)
            ->where('payment_method', Payment::METHOD_CREDIT)
            ->where('status', Payment::STATUS_CONFIRMED)
            ->whereHas('sale', fn ($q) => $q->where('customer_id', $customerId))
            ->sum('amount'));
    }

    private function repaidCents(int $customerId): int
    {
        return $this->cents(Payment::query()
            ->where('kind', Payment::KIND_REPAYMENT)
            ->where('customer_id', $customerId)
            ->where('status', Payment::STATUS_CONFIRMED)
            ->sum('amount'));
    }

    private function cents(mixed $amount): int
    {
        return (int) round(((float) $amount) * 100);
    }
}
