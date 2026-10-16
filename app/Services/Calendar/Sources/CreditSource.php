<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Finance\Payment;
use App\Models\Finance\Sale;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use App\Services\Finance\CustomerCreditService;
use Carbon\CarbonImmutable;

/**
 * Orders sold on credit, on the day the customer must pay. What is still
 * owed comes from CustomerCreditService (repayments cover the oldest first),
 * so an invoice paid off shows as done.
 */
class CreditSource implements CalendarSource
{
    public function __construct(private readonly CustomerCreditService $credit)
    {
    }

    public function key(): string
    {
        return 'credit';
    }

    public function label(): string
    {
        return 'Credit due';
    }

    public function tone(): string
    {
        return 'error';
    }

    public function apps(): array
    {
        return ['admin', 'seller'];
    }

    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $sales = Sale::query()
            ->with('customer')
            ->whereNotNull('customer_id')
            ->whereBetween('due_date', [$from->toDateString(), $to->toDateString()])
            ->whereHas('payments', fn ($q) => $q
                ->where('kind', Payment::KIND_SALE)
                ->where('payment_method', Payment::METHOD_CREDIT)
                ->where('status', Payment::STATUS_CONFIRMED))
            ->when($scope->storeIds !== null, fn ($q) => $q->whereIn('store_id', $scope->storeIds))
            ->limit(500)
            ->get();

        /** @var array<int, array<int, array<string, mixed>>> $invoices customer id → sale id → invoice */
        $invoices = [];

        return $sales->map(function (Sale $sale) use ($scope, &$invoices): ?array {
            $customerId = (int) $sale->customer_id;
            $invoices[$customerId] ??= collect($this->credit->invoices($customerId))->keyBy('sale_id')->all();
            $invoice = $invoices[$customerId][$sale->id] ?? null;
            if ($invoice === null) {
                return null;
            }

            $due = CarbonImmutable::instance($sale->due_date)->startOfDay();
            $owed = (float) $invoice['owed'];
            $customer = $sale->customer?->name ?? 'Customer';

            return CalendarItem::make(
                id: "credit:{$sale->id}",
                source: $this->key(),
                kind: 'credit_due',
                title: "{$customer} pays {$sale->reference_number}",
                start: $due,
                end: null,
                allDay: true,
                state: $owed <= 0 ? CalendarItem::DONE : CalendarItem::openState($due),
                status: $owed <= 0 ? 'paid' : 'owed',
                subtitle: $owed <= 0 ? 'Paid off' : 'Owed on credit',
                url: match ($scope->app) {
                    'admin' => CalendarItem::url('admin.credit.index'),
                    'seller' => CalendarItem::url('seller.customers.show', $customerId),
                    default => null,
                },
                amount: $owed > 0 ? $owed : $invoice['charged'],
                currency: 'ETB',
            );
        })->filter()->values()->all();
    }
}
