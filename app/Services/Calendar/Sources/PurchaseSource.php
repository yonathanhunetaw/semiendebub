<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Procurement\Purchase;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Purchase orders: the day the goods are expected, and (admin and
 * procurement only) the day the supplier is due to be paid, which is the
 * order date plus the order's payment days.
 *
 * Supplier payments are not recorded in Duka yet, so a passed due date reads
 * as "past", never "late".
 */
class PurchaseSource implements CalendarSource
{
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
            $events = array_merge($events, $this->paymentsDue($scope, $from, $to));
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

    /** @return array<int, array<string, mixed>> */
    private function paymentsDue(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        return $this->scoped($scope)
            ->with('supplier:id,name')
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
