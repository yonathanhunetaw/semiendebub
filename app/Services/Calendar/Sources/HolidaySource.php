<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Workforce\PublicHoliday;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use App\Services\Workforce\LocalTime;
use Carbon\CarbonImmutable;

/**
 * Public holidays, company-wide, on every app (work that day is overtime at
 * the holiday rate). Site closures and changed hours are SiteDaySource's.
 */
class HolidaySource implements CalendarSource
{
    public function key(): string
    {
        return 'holidays';
    }

    public function label(): string
    {
        return 'Public holidays';
    }

    public function tone(): string
    {
        return 'error';
    }

    public function apps(): array
    {
        return CalendarScope::APPS;
    }

    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $today = LocalTime::dateOf();

        return PublicHoliday::query()
            ->whereBetween('date', [$from->toDateString(), $to->toDateString()])
            ->orderBy('date')
            ->get()
            ->map(fn (PublicHoliday $holiday): array => CalendarItem::make(
                id: "holiday:{$holiday->id}",
                source: $this->key(),
                kind: 'holiday',
                title: (string) $holiday->name,
                start: CarbonImmutable::parse($holiday->date->toDateString()),
                end: null,
                allDay: true,
                state: $holiday->date->toDateString() < $today ? CalendarItem::PAST : CalendarItem::UPCOMING,
                subtitle: 'Public holiday · work today is paid at the holiday rate',
                url: CalendarItem::url("{$scope->app}.work.overtime"),
            ))->all();
    }
}
