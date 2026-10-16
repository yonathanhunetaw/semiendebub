<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Fulfillment\Delivery;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/** Customer delivery runs, on the day and time they are booked for (`scheduled_for`). */
class DeliverySource implements CalendarSource
{
    public function key(): string
    {
        return 'deliveries';
    }

    public function label(): string
    {
        return 'Deliveries';
    }

    public function tone(): string
    {
        return 'info';
    }

    public function apps(): array
    {
        return ['admin', 'seller', 'delivery'];
    }

    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $query = Delivery::query()
            ->with('sale:id,reference_number,store_id')
            ->whereBetween('scheduled_for', [$from, $to])
            ->where('status', '!=', 'cancelled');

        if ($scope->courierId !== null) {
            $query->forCourier($scope->courierId)->visibleToCourier();
        } elseif ($scope->storeIds !== null) {
            $ids = $scope->storeIds;
            $query->where(fn (Builder $q) => $q
                ->whereIn('source_store_id', $ids)
                ->orWhereHas('sale', fn (Builder $sale) => $sale->whereIn('store_id', $ids)));
        }

        return $query->orderBy('scheduled_for')->limit(500)->get()
            ->map(function (Delivery $delivery) use ($scope): array {
                $when = CarbonImmutable::instance($delivery->scheduled_for);
                $reference = $delivery->sale?->reference_number ?? $delivery->tracking_number ?? "#{$delivery->id}";
                $done = $delivery->status === 'delivered';

                return CalendarItem::make(
                    id: "delivery:{$delivery->id}",
                    source: $this->key(),
                    kind: 'delivery',
                    title: "Deliver {$reference}",
                    start: $when,
                    end: $when->addHour(),
                    allDay: false,
                    state: $done ? CalendarItem::DONE : ($delivery->status === 'failed' ? CalendarItem::LATE : CalendarItem::openState($when)),
                    status: (string) $delivery->status,
                    subtitle: trim(($delivery->recipient_name ?? '').' · '.($delivery->delivery_address ?? ''), ' ·') ?: null,
                    url: $this->url($scope, $delivery),
                );
            })->all();
    }

    private function url(CalendarScope $scope, Delivery $delivery): ?string
    {
        return match ($scope->app) {
            'admin' => CalendarItem::url('admin.deliveries.index'),
            'seller' => $delivery->sale !== null ? CalendarItem::url('seller.orders.custody', $delivery->sale->reference_number) : null,
            'delivery' => CalendarItem::url('delivery.delivery.index'),
            default => null,
        };
    }
}
