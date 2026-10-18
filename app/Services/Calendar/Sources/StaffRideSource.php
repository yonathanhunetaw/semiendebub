<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Workforce\StaffRide;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;

/**
 * Staff transport: rides you drive (delivery app), ride on or manage.
 */
class StaffRideSource implements CalendarSource
{
    public function __construct(private readonly Sites $sites)
    {
    }

    public function key(): string
    {
        return 'staff_rides';
    }

    public function label(): string
    {
        return 'Staff transport';
    }

    public function tone(): string
    {
        return 'tertiary';
    }

    public function apps(): array
    {
        return ['admin', 'seller', 'stock_keeper', 'delivery'];
    }

    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $viewer = $scope->viewer;
        $query = StaffRide::query()->with(['site', 'driver', 'vehicle'])
            ->where('status', '!=', StaffRide::STATUS_CANCELLED)
            ->whereBetween('departs_at', [$from, $to]);

        if ($scope->app === 'delivery') {
            $query->where(fn ($q) => $q->where('driver_id', $viewer->id)->orWhere('status', StaffRide::STATUS_REQUESTED));
        } else {
            $managed = $this->sites->managedBy($viewer)->pluck('id')->all();
            $query->where(fn ($q) => $q
                ->whereIn('stock_location_id', $managed)
                ->orWhereHas('riders', fn ($rider) => $rider->where('user_id', $viewer->id)));
        }

        return $query->limit(500)->get()->map(function (StaffRide $ride) use ($scope): array {
            $start = CarbonImmutable::instance($ride->departs_at);

            return CalendarItem::make(
                id: "staff-ride:{$ride->id}",
                source: $this->key(),
                kind: 'staff_ride',
                title: 'Staff ride from '.($ride->site?->name ?? 'site'),
                start: $start,
                end: $start->addHour(),
                allDay: false,
                state: $ride->status === StaffRide::STATUS_DONE ? CalendarItem::DONE : CalendarItem::openState($start),
                status: $ride->status,
                subtitle: $ride->driver ? $ride->driver->first_name.' · '.($ride->vehicle?->plate ?? '') : 'No driver yet',
                url: CalendarItem::url("{$scope->app}.work.rides"),
            );
        })->values()->all();
    }
}
