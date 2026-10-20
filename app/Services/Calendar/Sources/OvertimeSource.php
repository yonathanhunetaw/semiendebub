<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Inventory\StockLocation;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use App\Services\Workforce\OvertimeService;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;

/**
 * Days of overtime waiting for this manager's decision, at the sites they
 * manage (as the bell's "Overtime to approve" counts them). Nothing shows
 * when overtime needs no approval.
 */
class OvertimeSource implements CalendarSource
{
    public function __construct(
        private readonly Sites $sites,
        private readonly OvertimeService $overtime,
    ) {
    }

    public function key(): string
    {
        return 'overtime';
    }

    public function label(): string
    {
        return 'Overtime to decide';
    }

    public function tone(): string
    {
        return 'warning';
    }

    public function apps(): array
    {
        return ['admin', 'seller', 'stock_keeper', 'delivery'];
    }

    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        if (! $this->overtime->settings()->needs_approval) {
            return [];
        }

        $viewer = $scope->viewer;
        $managed = $this->sites->managedBy($viewer)
            ->filter(fn (StockLocation $site): bool => $scope->app !== 'admin' || $site->store_id === null || $scope->covers((int) $site->store_id))
            ->values();
        if ($managed->isEmpty()) {
            return [];
        }

        return collect($this->overtime->forSites($managed, $from->toDateString(), $to->toDateString()))
            ->filter(fn (array $day): bool => $day['status'] === 'pending' && $this->overtime->mayDecide($viewer, (int) $day['user_id'], (string) $day['date']))
            ->map(fn (array $day): array => CalendarItem::make(
                id: "overtime:{$day['user_id']}:{$day['date']}",
                source: $this->key(),
                kind: 'overtime',
                title: trim(($day['name'] ?: 'Someone').' · '.intdiv((int) $day['overtime'], 60).'h'.str_pad((string) ((int) $day['overtime'] % 60), 2, '0', STR_PAD_LEFT).' overtime'),
                start: CarbonImmutable::parse((string) $day['date']),
                end: null,
                allDay: true,
                state: CalendarItem::UPCOMING,
                status: 'pending',
                subtitle: 'Waiting for your decision'.($day['holiday'] ? ' · public holiday' : ''),
                url: CalendarItem::url("{$scope->app}.work.overtime"),
            ))
            ->values()
            ->all();
    }
}
