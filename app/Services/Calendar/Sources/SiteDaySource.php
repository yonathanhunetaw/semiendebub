<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Inventory\StockLocation;
use App\Models\Workforce\SiteDay;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;

/**
 * Each site's opening hours as a day on the calendar: who opens and closes,
 * and whether it was opened (or missed). Read from site_hours and site_days;
 * nothing is copied.
 */
class SiteDaySource implements CalendarSource
{
    /** Hours are read day by day, so a very long range is cut. */
    private const MAX_DAYS = 62;

    public function __construct(private readonly Sites $sites)
    {
    }

    public function key(): string
    {
        return 'site_days';
    }

    public function label(): string
    {
        return 'Opening & closing';
    }

    public function tone(): string
    {
        return 'success';
    }

    public function apps(): array
    {
        return ['admin', 'seller', 'stock_keeper'];
    }

    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $sites = $this->sites->query()->get()->filter(fn (StockLocation $site): bool => $scope->app === 'admin'
            ? ($site->store_id === null ? $scope->storeIds === null : $scope->covers((int) $site->store_id))
            : $this->sites->worksAt($scope->viewer, $site));

        if ($sites->isEmpty()) {
            return [];
        }

        // The shops' dates the range covers.
        $start = LocalTime::day($from);
        $end = LocalTime::day($to);
        if ($start->diffInDays($end) > self::MAX_DAYS) {
            $end = $start->addDays(self::MAX_DAYS);
        }

        $days = SiteDay::query()->with(['opener', 'closer'])
            ->whereIn('stock_location_id', $sites->pluck('id'))
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->get()
            ->keyBy(fn (SiteDay $day): string => $day->stock_location_id.'@'.$day->date->toDateString());

        $events = [];
        foreach ($sites as $site) {
            for ($date = $start; $date->lessThanOrEqualTo($end); $date = $date->addDay()) {
                $hours = $this->sites->hoursOn($site, $date);
                if ($hours === null) {
                    continue;
                }

                $day = $days[$site->id.'@'.$date->toDateString()] ?? null;
                $events[] = $this->item($scope, $site, $date, $hours, $day);
            }
        }

        return $events;
    }

    /**
     * @param  array{closed: bool, opens_at: string|null, closes_at: string|null, note: string|null, exception: bool}  $hours
     * @return array<string, mixed>
     */
    private function item(CalendarScope $scope, StockLocation $site, CarbonImmutable $date, array $hours, ?SiteDay $day): array
    {
        $url = CalendarItem::url("{$scope->app}.work");

        if ($hours['closed']) {
            return CalendarItem::make(
                id: "site-day:{$site->id}:{$date->toDateString()}",
                source: $this->key(),
                kind: 'closed_day',
                title: "{$site->name} closed",
                start: $date,
                end: null,
                allDay: true,
                state: CalendarItem::PAST,
                status: SiteDay::STATUS_CLOSED_DAY,
                subtitle: $hours['note'],
                url: $url,
            );
        }

        $opens = LocalTime::at($date, (string) $hours['opens_at']);
        $closes = LocalTime::at($date, (string) $hours['closes_at']);
        $status = $day?->status ?? SiteDay::STATUS_PLANNED;
        $name = fn ($user): ?string => $user ? $user->first_name : null;
        $who = array_filter([
            $day?->opener ? 'opens: '.$name($day->opener) : null,
            $day?->closer ? 'closes: '.$name($day->closer) : null,
        ]);

        return CalendarItem::make(
            id: "site-day:{$site->id}:{$date->toDateString()}",
            source: $this->key(),
            kind: 'site_day',
            title: $site->name.' '.$hours['opens_at'].'–'.$hours['closes_at'],
            start: $opens,
            end: $closes,
            allDay: false,
            state: match ($status) {
                SiteDay::STATUS_CLOSED => CalendarItem::DONE,
                SiteDay::STATUS_MISSED => CalendarItem::LATE,
                SiteDay::STATUS_OPEN => CalendarItem::UPCOMING,
                default => CalendarItem::openState($opens),
            },
            status: $status,
            subtitle: $who === [] ? ($status === SiteDay::STATUS_MISSED ? 'Not opened on time' : null) : implode(' · ', $who),
            url: $url,
        );
    }
}
