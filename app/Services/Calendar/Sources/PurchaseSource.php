<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Procurement\PayableInstallment;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\SupplierPayable;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use App\Services\Procurement\PayablesLedger;
use App\Services\Workforce\LocalTime;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Purchase orders: the day the goods are expected, and (admin and
 * procurement only) each supplier payment installment on its due day, paid,
 * due or late as PayablesLedger counts it (only confirmed money is paid).
 *
 * Orders approved before payables existed have none; for those the old guess
 * (order date + payment days) still shows, as "past" rather than "late"
 * because nothing records their payment.
 */
class PurchaseSource implements CalendarSource
{
    public function __construct(private readonly PayablesLedger $ledger)
    {
    }

    /** Raised but not yet placed, or placed and still open. */
    private const ARRIVING = [
        Purchase::STATUS_SUBMITTED,
        Purchase::STATUS_APPROVED,
        Purchase::STATUS_ORDERED,
        Purchase::STATUS_PARTIALLY_RECEIVED,
    ];

    private const ARRIVED = [Purchase::STATUS_RECEIVED, Purchase::STATUS_CLOSED];

    /** The longest payment term looked back over. */
    private const MAX_PAYMENT_DAYS = 365;

    public function key(): string
    {
        return 'purchases';
    }

    public function label(): string
    {
        return 'Purchase orders';
    }

    public function tone(): string
    {
        return 'warning';
    }

    public function apps(): array
    {
        return ['admin', 'stock_keeper', 'procurement'];
    }

    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $events = $this->arrivals($scope, $from, $to);

        if ($scope->app !== 'stock_keeper') {
            $events = array_merge($events, $this->installmentsDue($scope, $from, $to), $this->paymentsDue($scope, $from, $to));
        }

        return $events;
    }

    /** @return array<int, array<string, mixed>> */
    private function arrivals(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        return $this->scoped($scope)
            ->with('supplier:id,name')
            ->whereBetween('expected_at', [$from, $to])
            ->whereIn('status', [...self::ARRIVING, ...self::ARRIVED])
            ->limit(500)
            ->get()
            ->map(function (Purchase $purchase) use ($scope): array {
                $when = CarbonImmutable::instance($purchase->expected_at)->startOfDay();

                return CalendarItem::make(
                    id: "purchase-arrival:{$purchase->id}",
                    source: $this->key(),
                    kind: 'po_arrival',
                    title: "PO {$purchase->reference_number} arrives",
                    start: $when,
                    end: null,
                    allDay: true,
                    state: in_array($purchase->status, self::ARRIVED, true) ? CalendarItem::DONE : CalendarItem::openState($when),
                    status: (string) $purchase->status,
                    subtitle: $this->supplierName($purchase),
                    url: $this->url($scope, $purchase),
                );
            })->all();
    }

    /**
     * Every installment of a live payable whose due day falls in the range.
     * Due days are mostly computed (from the order, shipping or arrival
     * date), so they are worked out here rather than filtered in SQL.
     *
     * @return array<int, array<string, mixed>>
     */
    private function installmentsDue(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $first = $from->toDateString();
        $last = $to->toDateString();
        $today = CarbonImmutable::parse(LocalTime::dateOf());

        $payables = SupplierPayable::query()
            ->whereNull('cancelled_at')
            ->with(['installments.payments', 'payable', 'supplier:id,name'])
            // A store's view: the payables of its orders. Payables that belong to no order are company-wide.
            ->when($scope->storeIds !== null, fn (Builder $q) => $q->whereHasMorph('payable', [Purchase::class], fn (Builder $p) => $p->whereIn('store_id', $scope->storeIds)))
            ->limit(2000)
            ->get();

        $events = [];
        foreach ($payables as $payable) {
            $owner = $payable->payable;
            foreach ($payable->installments as $installment) {
                /** @var PayableInstallment $installment */
                $installment->setRelation('supplierPayable', $payable);
                $row = $this->ledger->installment($installment, $today);
                if ($row['due_on'] === null || $row['due_on'] < $first || $row['due_on'] > $last) {
                    continue;
                }

                $reference = $owner instanceof Purchase ? "PO {$owner->reference_number}" : (string) $payable->description;
                $events[] = CalendarItem::make(
                    id: "payable-installment:{$installment->id}",
                    source: $this->key(),
                    kind: 'supplier_payment',
                    title: 'Pay '.($payable->supplier?->name ?? ($owner instanceof Purchase ? $this->supplierName($owner) : null) ?? 'supplier'),
                    start: CarbonImmutable::parse($row['due_on']),
                    end: null,
                    allDay: true,
                    state: match ($row['state']) {
                        'paid' => CalendarItem::DONE,
                        'overdue' => CalendarItem::LATE,
                        default => CalendarItem::UPCOMING,
                    },
                    status: $row['state'],
                    subtitle: trim($reference.($row['label'] !== '' ? " · {$row['label']}" : '').($row['waiting'] > 0 ? ' · payment waiting to be confirmed' : '')),
                    url: $owner instanceof Purchase ? $this->url($scope, $owner) : CalendarItem::url('procurement.payables.index'),
                    // What is left (or, once paid, what it was), in the order's own currency.
                    amount: $row['remaining'] > 0 ? $row['remaining'] : $row['amount'],
                    currency: (string) $payable->currency,
                );
            }
        }

        return $events;
    }

    /**
     * The old guess, for orders approved before payables existed.
     *
     * @return array<int, array<string, mixed>>
     */
    private function paymentsDue(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        return $this->scoped($scope)
            ->with('supplier:id,name')
            ->whereDoesntHave('payable')
            ->where('payment_days', '>', 0)
            ->whereNotNull('purchased_at')
            ->whereBetween('purchased_at', [$from->subDays(self::MAX_PAYMENT_DAYS), $to])
            ->whereNotIn('status', [Purchase::STATUS_DRAFT, Purchase::STATUS_CANCELLED])
            ->limit(1000)
            ->get()
            ->map(function (Purchase $purchase) use ($scope, $from, $to): ?array {
                $due = CarbonImmutable::instance($purchase->purchased_at)->startOfDay()->addDays((int) $purchase->payment_days);
                if ($due->lt($from->startOfDay()) || $due->gt($to)) {
                    return null;
                }

                return CalendarItem::make(
                    id: "purchase-payment:{$purchase->id}",
                    source: $this->key(),
                    kind: 'supplier_payment',
                    title: 'Pay '.($this->supplierName($purchase) ?? 'supplier'),
                    start: $due,
                    end: null,
                    allDay: true,
                    state: CalendarItem::openState($due, knowsLate: false),
                    status: "PO {$purchase->reference_number} · {$purchase->payment_days} days",
                    subtitle: "PO {$purchase->reference_number}",
                    url: $this->url($scope, $purchase),
                    amount: $purchase->total_amount,
                    currency: 'ETB',
                );
            })->filter()->values()->all();
    }

    private function scoped(CalendarScope $scope): Builder
    {
        $query = Purchase::query();

        return $scope->storeIds === null ? $query : $query->whereIn('store_id', $scope->storeIds);
    }

    private function supplierName(Purchase $purchase): ?string
    {
        return $purchase->supplier?->name ?? ($purchase->supplier_name ?: null);
    }

    private function url(CalendarScope $scope, Purchase $purchase): ?string
    {
        return in_array($scope->app, ['admin', 'procurement'], true)
            ? CalendarItem::url('procurement.purchase_orders.show', $purchase->id)
            : null;
    }
}
