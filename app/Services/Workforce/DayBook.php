<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Models\Workforce\SiteDay;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Names the business day a record belongs to ("Today", "Yesterday",
 * "Monday, Oct 19", "Outside open hours"), for tagging rows on lists.
 *
 * Loads each store's recent days once, so tagging a whole list costs one
 * query per store, not one per row. Build one per request.
 */
final class DayBook
{
    /** How far back the days are loaded; older records are named by their calendar date. */
    private const DAYS_BACK = 90;

    /** @var array<int, Collection<int, SiteDay>> */
    private array $byStore = [];

    public function __construct(private readonly ShopDay $shopDay)
    {
    }

    /**
     * @return array{key: string, label: string, outside: bool, date: string}|null
     *   `key` groups rows ("2026-10-19" or "outside"); `date` is the shops' calendar date of the moment.
     */
    public function tag(?int $storeId, ?CarbonInterface $at): ?array
    {
        if ($at === null) {
            return null;
        }

        $calendar = LocalTime::dateOf($at);
        $day = $storeId === null ? null : $this->dayOf($storeId, CarbonImmutable::instance($at)->utc());

        if ($day === null) {
            return [
                'key' => 'outside',
                'label' => $storeId === null ? $this->dateLabel($calendar) : 'Outside open hours',
                'outside' => $storeId !== null,
                'date' => $calendar,
            ];
        }

        $date = $day->date->toDateString();

        return [
            'key' => $date,
            // The open day is "Today" until it closes, even past midnight.
            'label' => $day->status === SiteDay::STATUS_OPEN ? 'Today' : $this->dateLabel($date),
            'outside' => false,
            'date' => $calendar,
        ];
    }

    /** "Today", "Yesterday", "Monday, Oct 19" (with the year when it is not this one). */
    public function dateLabel(string $date): string
    {
        $today = LocalTime::dateOf();

        return match (true) {
            $date === $today => 'Today',
            $date === LocalTime::today()->subDay()->toDateString() => 'Yesterday',
            default => LocalTime::day($date)->format(substr($date, 0, 4) === substr($today, 0, 4) ? 'l, M j' : 'l, M j Y'),
        };
    }

    private function dayOf(int $storeId, CarbonImmutable $at): ?SiteDay
    {
        foreach ($this->daysOf($storeId) as $day) {
            if ($day->opened_at->lte($at) && ($day->closed_at === null || $day->closed_at->gte($at))) {
                return $day;
            }
        }

        return null;
    }

    /** @return Collection<int, SiteDay> */
    private function daysOf(int $storeId): Collection
    {
        if (! isset($this->byStore[$storeId])) {
            $site = $this->shopDay->siteOf($storeId);

            $this->byStore[$storeId] = $site === null ? collect() : SiteDay::query()
                ->where('stock_location_id', $site->id)
                ->whereNotNull('opened_at')
                ->where('opened_at', '>=', LocalTime::today()->subDays(self::DAYS_BACK)->utc())
                ->orderByDesc('opened_at')
                ->get();
        }

        return $this->byStore[$storeId];
    }
}
