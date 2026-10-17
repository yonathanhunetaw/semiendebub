<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Services\Calendar\Sources\CreditSource;
use App\Services\Calendar\Sources\DeliverySource;
use App\Services\Calendar\Sources\EntrySource;
use App\Services\Calendar\Sources\PurchaseSource;
use App\Services\Calendar\Sources\ShiftSource;
use App\Services\Calendar\Sources\ShipmentSource;
use App\Services\Calendar\Sources\SiteDaySource;
use App\Services\Calendar\Sources\TransferSource;
use Carbon\CarbonImmutable;

/**
 * Everything on one calendar: the calendar's own entries plus what each
 * module already schedules, read live (never copied). Which sources an app
 * shows is each source's `apps()`.
 *
 * To put a new module on the calendar, write a CalendarSource and list it here.
 */
class CalendarFeed
{
    /** @var array<int, CalendarSource> */
    private array $sources;

    public function __construct(
        EntrySource $entries,
        DeliverySource $deliveries,
        ShipmentSource $shipments,
        TransferSource $transfers,
        PurchaseSource $purchases,
        CreditSource $credit,
        SiteDaySource $siteDays,
        ShiftSource $shifts,
    ) {
        $this->sources = [$entries, $deliveries, $shipments, $transfers, $purchases, $credit, $siteDays, $shifts];
    }

    /** @return array<int, CalendarSource> */
    public function sourcesFor(string $app): array
    {
        return array_values(array_filter($this->sources, fn (CalendarSource $s): bool => in_array($app, $s->apps(), true)));
    }

    /** @return array<int, array{key: string, label: string, tone: string}> */
    public function legend(string $app): array
    {
        return array_map(fn (CalendarSource $s): array => [
            'key' => $s->key(),
            'label' => $s->label(),
            'tone' => $s->tone(),
        ], $this->sourcesFor($app));
    }

    /**
     * @param  array<int, string>|null  $only  source keys; null = all of the app's
     * @return array<int, array<string, mixed>>
     */
    public function between(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to, ?array $only = null): array
    {
        $events = [];
        foreach ($this->sourcesFor($scope->app) as $source) {
            if ($only !== null && ! in_array($source->key(), $only, true)) {
                continue;
            }

            array_push($events, ...$source->events($scope, $from, $to));
        }

        usort($events, fn (array $a, array $b): int => strcmp((string) $a['start'], (string) $b['start']));

        return $events;
    }
}
