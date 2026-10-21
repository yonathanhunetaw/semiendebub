<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Procurement\PriceCheck;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use App\Services\Procurement\PriceCheckService;
use Carbon\CarbonImmutable;

/**
 * Price checks on their due day: open (or late) until closed. Each viewer sees
 * the checks PriceCheckService lets them see (a seller only those that name
 * nobody or name them).
 */
class PriceCheckSource implements CalendarSource
{
    public function __construct(private readonly PriceCheckService $checks)
    {
    }

    public function key(): string
    {
        return 'price_checks';
    }

    public function label(): string
    {
        return 'Price checks';
    }

    public function tone(): string
    {
        return 'info';
    }

    public function apps(): array
    {
        return ['admin', 'seller'];
    }

    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        return $this->checks->visibleTo(PriceCheck::query(), $scope->viewer)
            ->when($scope->storeIds !== null, fn ($q) => $q->whereIn('store_id', $scope->storeIds))
            ->whereNotNull('due_on')
            ->whereDate('due_on', '>=', $from->toDateString())
            ->whereDate('due_on', '<=', $to->toDateString())
            ->with(['idea:id,name', 'item:id,product_name', 'store:id,name'])
            ->limit(500)
            ->get()
            ->map(function (PriceCheck $check) use ($scope): array {
                $when = CarbonImmutable::parse($check->due_on->toDateString())->startOfDay();

                return CalendarItem::make(
                    id: "price-check:{$check->id}",
                    source: $this->key(),
                    kind: 'price_check',
                    title: "Prices: {$check->subject()}",
                    start: $when,
                    end: null,
                    allDay: true,
                    state: $check->status === PriceCheck::CLOSED ? CalendarItem::DONE : CalendarItem::openState($when),
                    status: (string) $check->status,
                    subtitle: (string) ($check->store?->name ?? ''),
                    url: CalendarItem::url(($scope->app === 'seller' ? 'seller' : 'admin').'.price_checks.show', $check->id),
                );
            })->all();
    }
}
