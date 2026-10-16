<?php

declare(strict_types=1);

namespace App\Services\Procurement;

use App\Exceptions\PurchaseOrderException;
use App\Models\Procurement\PayableInstallment;
use App\Models\Procurement\Purchase;

/**
 * Turns an order's payment terms into installments that add up to its total
 * exactly.
 *
 *   immediate     one payment, due when the order is placed
 *   fixed_date    one payment, N days after the order (or after shipping)
 *   installments  the rows on the order: each a percent or an amount, due on
 *                 order, N days after order / shipping / arrival, or on a date
 *
 * Percent rows are rounded to the cent; whatever the rounding leaves over
 * goes to the last percent row, so the schedule never drifts from the total.
 */
class PaymentScheduleBuilder
{
    public const MAX_ROWS = 12;

    /**
     * @return array<int, array{sequence: int, label: string, percent: float|null, amount: float, due_rule: string, due_days: int|null, due_date: string|null}>
     */
    public function forPurchase(Purchase $purchase): array
    {
        return $this->build(
            (string) $purchase->payment_terms,
            (float) $purchase->subtotal_foreign,
            $purchase->payment_days,
            $purchase->payment_anchor,
            $purchase->payment_schedule ?? [],
            (string) $purchase->currency,
        );
    }

    /**
     * @param  array<int, array<string, mixed>>  $template
     * @return array<int, array{sequence: int, label: string, percent: float|null, amount: float, due_rule: string, due_days: int|null, due_date: string|null}>
     */
    public function build(string $terms, float $total, ?int $days, ?string $anchor, array $template, string $currency = ''): array
    {
        $total = round($total, 2);

        return match ($terms) {
            'immediate' => [$this->row(1, 'Full payment', 100.0, $total, PayableInstallment::DUE_ON_ORDER, null, null)],
            'fixed_date' => [$this->row(
                1,
                'Full payment',
                100.0,
                $total,
                $anchor === 'shipping' ? PayableInstallment::DUE_AFTER_SHIPPING : PayableInstallment::DUE_AFTER_ORDER,
                $days ?? throw new PurchaseOrderException('Say how many days after the order the payment is due.'),
                null,
            )],
            'installments' => $this->installments($template, $total, $currency),
            default => throw new PurchaseOrderException("Unknown payment terms: {$terms}."),
        };
    }

    /**
     * @param  array<int, array<string, mixed>>  $template
     * @return array<int, array<string, mixed>>
     */
    private function installments(array $template, float $total, string $currency): array
    {
        $template = array_values($template);

        if ($template === []) {
            throw new PurchaseOrderException('Add the installments: at least one row of percent or amount.');
        }

        if (count($template) > self::MAX_ROWS) {
            throw new PurchaseOrderException('At most '.self::MAX_ROWS.' installments.');
        }

        $rows = [];
        $lastPercent = null;

        foreach ($template as $i => $t) {
            $percent = isset($t['percent']) && $t['percent'] !== '' && $t['percent'] !== null ? (float) $t['percent'] : null;
            $amount = $percent === null ? round((float) ($t['amount'] ?? 0), 2) : round($total * $percent / 100, 2);

            if ($amount <= 0 && $total > 0) {
                throw new PurchaseOrderException('Installment '.($i + 1).' needs a percent or an amount.');
            }

            $rule = (string) ($t['due'] ?? PayableInstallment::DUE_ON_ORDER);

            if (! in_array($rule, PayableInstallment::DUE_RULES, true)) {
                throw new PurchaseOrderException('Installment '.($i + 1).' has no valid due rule.');
            }

            $needsDays = in_array($rule, [PayableInstallment::DUE_AFTER_ORDER, PayableInstallment::DUE_AFTER_SHIPPING, PayableInstallment::DUE_AFTER_ARRIVAL], true);
            $daysValue = $needsDays ? (int) ($t['days'] ?? -1) : null;

            if ($needsDays && $daysValue < 0) {
                throw new PurchaseOrderException('Installment '.($i + 1).': say how many days.');
            }

            $date = $rule === PayableInstallment::DUE_ON_DATE ? (string) ($t['date'] ?? '') : null;

            if ($rule === PayableInstallment::DUE_ON_DATE && $date === '') {
                throw new PurchaseOrderException('Installment '.($i + 1).': pick the date.');
            }

            $label = trim((string) ($t['label'] ?? '')) ?: ($i === 0 && count($template) > 1 ? 'Deposit' : 'Installment '.($i + 1));
            $rows[] = $this->row($i + 1, $label, $percent, $amount, $rule, $daysValue, $date);

            if ($percent !== null) {
                $lastPercent = $i;
            }
        }

        $sum = round(array_sum(array_column($rows, 'amount')), 2);
        $gap = round($total - $sum, 2);

        // Rounding leaves a few cents: the last percent row takes them.
        if ($gap !== 0.0 && $lastPercent !== null && abs($gap) <= 0.01 * count($rows)) {
            $rows[$lastPercent]['amount'] = round($rows[$lastPercent]['amount'] + $gap, 2);
            $gap = 0.0;
        }

        if ($gap !== 0.0) {
            $money = fn (float $v): string => trim($currency.' '.number_format($v, 2));

            throw new PurchaseOrderException("The installments add up to {$money($sum)}, but the order is {$money($total)}.");
        }

        return $rows;
    }

    /** @return array{sequence: int, label: string, percent: float|null, amount: float, due_rule: string, due_days: int|null, due_date: string|null} */
    private function row(int $sequence, string $label, ?float $percent, float $amount, string $rule, ?int $days, ?string $date): array
    {
        return [
            'sequence' => $sequence,
            'label' => $label,
            'percent' => $percent,
            'amount' => $amount,
            'due_rule' => $rule,
            'due_days' => $days,
            'due_date' => $date,
        ];
    }
}
