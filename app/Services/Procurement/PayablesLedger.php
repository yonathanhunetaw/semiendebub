<?php

declare(strict_types=1);

namespace App\Services\Procurement;

use App\Models\Procurement\PayableInstallment;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\SupplierPayable;
use App\Models\Procurement\SupplierPayment;
use App\Services\Workforce\LocalTime;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * What is owed to suppliers, computed from payables, installments and
 * confirmed payments; nothing here is stored. Like BalanceLedger for sales:
 * only confirmed money counts as paid, claimed money is "waiting".
 *
 * An installment is:
 *   paid       nothing left
 *   overdue    left to pay and its due date has passed
 *   due        left to pay, due date known
 *   waiting    left to pay, the event it counts from has not happened yet
 *   cancelled  its payable was cancelled (the order was)
 */
class PayablesLedger
{
    public const DUE_SOON_DAYS = 7;

    /** The installment's due date, or null while the event it counts from is still ahead. */
    public function dueDate(PayableInstallment $installment): ?CarbonImmutable
    {
        $rule = $installment->due_rule;

        if ($rule === PayableInstallment::DUE_ON_DATE) {
            return $installment->due_date ? CarbonImmutable::parse($installment->due_date)->startOfDay() : null;
        }

        $event = match ($rule) {
            PayableInstallment::DUE_ON_ORDER, PayableInstallment::DUE_AFTER_ORDER => 'order',
            PayableInstallment::DUE_AFTER_SHIPPING => 'shipping',
            PayableInstallment::DUE_AFTER_ARRIVAL => 'arrival',
            default => null,
        };

        $owner = $installment->supplierPayable?->payable;
        $anchor = $event !== null && $owner instanceof Purchase ? $owner->anchorDate($event) : null;

        if (! $anchor instanceof CarbonInterface) {
            return null;
        }

        return CarbonImmutable::parse($anchor)->startOfDay()->addDays((int) ($installment->due_days ?? 0));
    }

    /**
     * One installment with its money and state.
     *
     * @return array{id: int, sequence: int, label: string, percent: float|null, amount: float, paid: float, waiting: float, remaining: float, payable_now: float, due_rule: string, due_days: int|null, due_on: string|null, state: string}
     */
    public function installment(PayableInstallment $installment, ?CarbonImmutable $today = null): array
    {
        $today ??= CarbonImmutable::parse(LocalTime::dateOf());
        $payments = $installment->relationLoaded('payments') ? $installment->payments : $installment->payments()->get();

        $paid = round((float) $payments->where('status', SupplierPayment::STATUS_CONFIRMED)->sum('amount'), 2);
        $waiting = round((float) $payments->where('status', SupplierPayment::STATUS_CLAIMED)->sum('amount'), 2);
        $remaining = round(max(0, (float) $installment->amount - $paid), 2);
        $due = $this->dueDate($installment);
        $cancelled = $installment->supplierPayable?->cancelled_at !== null;

        $state = match (true) {
            $remaining <= 0 => 'paid',
            $cancelled => 'cancelled',
            $due === null => 'waiting',
            $due->lt($today) => 'overdue',
            default => 'due',
        };

        return [
            'id' => (int) $installment->id,
            'sequence' => (int) $installment->sequence,
            'label' => (string) $installment->label,
            'percent' => $installment->percent !== null ? (float) $installment->percent : null,
            'amount' => (float) $installment->amount,
            'paid' => $paid,
            'waiting' => $waiting,
            'remaining' => $remaining,
            // What may still be recorded: not what is already waiting for confirmation.
            'payable_now' => $cancelled ? 0.0 : round(max(0, $remaining - $waiting), 2),
            'due_rule' => (string) $installment->due_rule,
            'due_days' => $installment->due_days,
            'due_on' => $due?->toDateString(),
            'state' => $state,
        ];
    }

    /**
     * A payable's totals and its schedule.
     *
     * @return array<string, mixed>
     */
    public function summary(SupplierPayable $payable, ?CarbonImmutable $today = null): array
    {
        $today ??= CarbonImmutable::parse(LocalTime::dateOf());
        $payable->loadMissing(['installments.payments', 'payable']);

        $rows = $payable->installments->map(function (PayableInstallment $i) use ($payable, $today) {
            $i->setRelation('supplierPayable', $payable);

            return $this->installment($i, $today);
        })->values();

        $remaining = round((float) $rows->sum('remaining'), 2);
        $cancelled = $payable->cancelled_at !== null;

        return [
            'id' => (int) $payable->id,
            'currency' => (string) $payable->currency,
            'amount' => (float) $payable->amount,
            'paid' => round((float) $rows->sum('paid'), 2),
            'waiting' => round((float) $rows->sum('waiting'), 2),
            'remaining' => $cancelled ? 0.0 : $remaining,
            'remaining_etb_estimate' => $cancelled ? 0.0 : round($remaining * (float) $payable->estimate_rate, 2),
            'overdue' => round((float) $rows->where('state', 'overdue')->sum('remaining'), 2),
            'paid_etb' => round((float) $payable->installments->flatMap->payments->where('status', SupplierPayment::STATUS_CONFIRMED)->sum('amount_etb'), 2),
            'cancelled' => $cancelled,
            'installments' => $rows->all(),
        ];
    }

    /**
     * Every installment still to pay, across open payables, soonest first;
     * the ones with no date yet last.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function openInstallments(?int $supplierId = null, ?CarbonImmutable $today = null): Collection
    {
        $today ??= CarbonImmutable::parse(LocalTime::dateOf());

        return SupplierPayable::query()
            ->whereNull('cancelled_at')
            ->when($supplierId !== null, fn ($q) => $q->where('supplier_id', $supplierId))
            ->with(['installments.payments', 'payable', 'supplier'])
            ->get()
            ->flatMap(function (SupplierPayable $payable) use ($today) {
                return $payable->installments->map(function (PayableInstallment $i) use ($payable, $today) {
                    $i->setRelation('supplierPayable', $payable);
                    $row = $this->installment($i, $today);
                    $owner = $payable->payable;

                    return $row + [
                        'payable_id' => (int) $payable->id,
                        'kind' => (string) $payable->kind,
                        'currency' => (string) $payable->currency,
                        'remaining_etb_estimate' => round($row['remaining'] * (float) $payable->estimate_rate, 2),
                        'supplier_id' => $payable->supplier_id !== null ? (int) $payable->supplier_id : null,
                        'supplier' => $payable->supplier?->name,
                        'purchase_id' => $owner instanceof Purchase ? (int) $owner->id : null,
                        'reference' => $owner instanceof Purchase ? (string) $owner->reference_number : null,
                    ];
                });
            })
            ->filter(fn (array $row) => $row['remaining'] > 0)
            ->sortBy(fn (array $row) => $row['due_on'] ?? '9999-12-31')
            ->values();
    }

    /**
     * Headline figures in ETB (unpaid amounts at each order's rate).
     *
     * @return array{owed_etb: float, overdue_etb: float, due_soon_etb: float, waiting_count: int}
     */
    public function totals(?CarbonImmutable $today = null): array
    {
        $today ??= CarbonImmutable::parse(LocalTime::dateOf());
        $rows = $this->openInstallments(null, $today);
        $soon = $today->addDays(self::DUE_SOON_DAYS)->toDateString();

        return [
            'owed_etb' => round((float) $rows->sum('remaining_etb_estimate'), 2),
            'overdue_etb' => round((float) $rows->where('state', 'overdue')->sum('remaining_etb_estimate'), 2),
            'due_soon_etb' => round((float) $rows->filter(fn ($r) => $r['state'] === 'due' && $r['due_on'] <= $soon)->sum('remaining_etb_estimate'), 2),
            'waiting_count' => SupplierPayment::query()->where('status', SupplierPayment::STATUS_CLAIMED)->count(),
        ];
    }
}
