<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Fulfillment\Shipment;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use App\Services\Workforce\LocalTime;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Freight between hubs and stores: from the agreed window (or the proposed
 * one while the parties are still agreeing) to the ETA.
 */
class ShipmentSource implements CalendarSource
{
    private const SHOW_ROUTES = [
        'admin' => 'admin.inventory.shipments.show',
        'seller' => 'seller.shipments.show',
        'stock_keeper' => 'stock_keeper.shipments.show',
        'delivery' => 'delivery.shipments.show',
    ];

    public function key(): string
    {
        return 'shipments';
    }

    public function label(): string
    {
        return 'Freight';
    }

    public function tone(): string
    {
        return 'primary';
    }

    public function apps(): array
    {
        return ['admin', 'seller', 'stock_keeper', 'delivery'];
    }

    /*
     * The shipment module keeps its times as typed on the shops' clock (it
     * saves and shows "2026-10-24T09:00" as is), so the range is compared in
     * wall-clock terms and each time is read back on the shops' clock.
     */
    public function events(CalendarScope $scope, CarbonImmutable $utcFrom, CarbonImmutable $utcTo): array
    {
        $from = LocalTime::wall($utcFrom, 'Y-m-d H:i:s');
        $to = LocalTime::wall($utcTo, 'Y-m-d H:i:s');
        $query = Shipment::query()
            ->with(['origin:id,name', 'destination:id,name', 'originLocation:id,name', 'destinationLocation:id,name'])
            ->where('status', '!=', 'cancelled')
            ->where(fn (Builder $q) => $q
                ->whereBetween('agreed_scheduled_for', [$from, $to])
                ->orWhereBetween('scheduled_for', [$from, $to])
                ->orWhereBetween('eta', [$from, $to])
                // A run that spans the whole range.
                ->orWhere(fn (Builder $span) => $span
                    ->where('scheduled_for', '<', $from)
                    ->where('eta', '>', $to)));

        if ($scope->courierId !== null) {
            $query->where('courier_id', $scope->courierId);
        } elseif ($scope->storeIds !== null) {
            $ids = $scope->storeIds;
            $query->where(fn (Builder $q) => $q->whereIn('origin_store_id', $ids)->orWhereIn('destination_store_id', $ids));
        }

        return $query->limit(500)->get()
            ->map(function (Shipment $shipment) use ($scope): ?array {
                $planned = $shipment->agreed_scheduled_for ?? $shipment->scheduled_for ?? $shipment->eta;
                if ($planned === null) {
                    return null;
                }

                $start = self::onShopsClock($planned);
                $eta = $shipment->eta !== null ? self::onShopsClock($shipment->eta) : null;
                $end = $eta !== null && $eta->gt($start) ? $eta : $start->addHours(2);
                $done = in_array($shipment->status, ['delivered', 'received'], true);
                $route = self::SHOW_ROUTES[$scope->app] ?? null;

                return CalendarItem::make(
                    id: "shipment:{$shipment->id}",
                    source: $this->key(),
                    kind: 'freight',
                    title: "Freight {$shipment->reference}",
                    start: $start,
                    end: $end,
                    allDay: false,
                    state: $done ? CalendarItem::DONE : CalendarItem::openState($end),
                    status: (string) $shipment->status,
                    subtitle: ($shipment->originLocation?->name ?? $shipment->origin?->name ?? '?').' → '.($shipment->destinationLocation?->name ?? $shipment->destination?->name ?? '?')
                        .($shipment->agreed_scheduled_for === null && ! $done ? ' (window not agreed yet)' : ''),
                    url: $route !== null ? CalendarItem::url($route, $shipment->id) : null,
                );
            })->filter()->values()->all();
    }

    /** A shipment time (shops' wall clock, stored as typed) as a real instant. */
    private static function onShopsClock(\DateTimeInterface $wall): CarbonImmutable
    {
        return LocalTime::parse($wall->format('Y-m-d H:i'));
    }
}
