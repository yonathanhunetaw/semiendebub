<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Models\Inventory\StockLocation;
use App\Models\Workforce\SiteDay;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Closure;
use Illuminate\Contracts\Database\Eloquent\Builder as EloquentContract;
use Illuminate\Contracts\Database\Query\Expression;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;

/**
 * The time filter on lists (`?when=today|yesterday|week|month|outside|all`, or
 * `?when=day&date=2026-10-19`).
 *
 *   today, yesterday, day   each store's own business day (opening to closing), side by side
 *   week, month             the shops' calendar days, everything that happened in them
 *   outside                 what happened while its store was not open (last 30 days)
 *   all                     "Recent": everything except the archive (the default)
 *   archive                 finished work older than app.archive_after_days (90)
 *
 * Nothing is ever deleted. Finished records older than the cut-off leave the
 * everyday lists and are kept under Archive; work still open is never archived.
 *
 * It narrows FINISHED records and totals. Work still open (carts, unpaid
 * orders, unconfirmed payments, deliveries on the road) is never filtered
 * out by date: lists show it all and tag each row with its day and age.
 */
final class TimeFilter
{
    public const WHEN = ['today', 'yesterday', 'week', 'month', 'outside', 'all', 'archive'];

    public const LABELS = [
        'today' => 'Today',
        'yesterday' => 'Yesterday',
        'week' => 'Last 7 days',
        'month' => 'This month',
        'outside' => 'Outside open hours',
        'all' => 'Recent',
        'archive' => 'Archive',
    ];

    /** The moment before which finished records are in the archive. */
    public static function archiveCutoff(): CarbonImmutable
    {
        return LocalTime::startOf(LocalTime::today()->subDays(max(1, (int) config('app.archive_after_days', 90))));
    }

    public function __construct(private readonly ShopDay $shopDay)
    {
    }

    /** @return array{when: string, date: string|null} */
    public function fromRequest(Request $request, string $default = 'all'): array
    {
        $when = (string) $request->query('when', $default);
        $date = $request->query('date');

        if ($when === 'day' && is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1) {
            return ['when' => 'day', 'date' => $date];
        }

        return ['when' => in_array($when, self::WHEN, true) ? $when : $default, 'date' => null];
    }

    /**
     * Narrow a query to the period.
     *
     * @template T of EloquentContract|Builder
     *
     * @param  T  $query
     * @param  string|Expression  $timeColumn  the record's time, qualified ('sales.created_at')
     * @param  string|Expression  $storeColumn  its store, qualified ('sales.store_id')
     * @param  array<int, int>|null  $storeIds  the stores in scope; null = every store
     * @param  array{when: string, date: string|null}  $period
     * @return T
     */
    public function apply($query, string|Expression $timeColumn, string|Expression $storeColumn, ?array $storeIds, array $period)
    {
        switch ($period['when']) {
            case 'all':
                return $query->where($timeColumn, '>=', self::archiveCutoff());

            case 'archive':
                return $query->where($timeColumn, '<', self::archiveCutoff());

            case 'week':
                return $query->where($timeColumn, '>=', LocalTime::startOf(LocalTime::today()->subDays(6)));

            case 'month':
                return $query->where($timeColumn, '>=', LocalTime::startOf(LocalTime::today()->startOfMonth()));

            case 'outside':
                $query->where($timeColumn, '>=', LocalTime::startOf(LocalTime::today()->subDays(29)));
                if ($storeIds !== null) {
                    $query->whereIn($storeColumn, $storeIds ?: [0]);
                }

                return $this->shopDay->outsideHours($query, $timeColumn, $storeColumn);
        }

        $spans = $this->spans($storeIds, $period);

        if ($spans === []) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where(function ($any) use ($spans, $timeColumn, $storeColumn): void {
            foreach ($spans as [$storeId, $from, $to]) {
                $any->orWhere(function ($one) use ($storeId, $from, $to, $timeColumn, $storeColumn): void {
                    $one->where($storeColumn, $storeId)->where($timeColumn, '>=', $from);

                    if ($to !== null) {
                        $one->where($timeColumn, '<=', $to);
                    }
                });
            }
        });
    }

    /**
     * The same periods on plain Addis calendar dates, midnight to midnight, for
     * people with no store day of their own (couriers, finance, procurement).
     * "Outside open hours" means nothing there and narrows nothing.
     *
     * @template T of EloquentContract|Builder
     *
     * @param  T  $query
     * @param  array{when: string, date: string|null}  $period
     * @return T
     */
    public function applyCalendar($query, string|Expression $timeColumn, array $period)
    {
        $today = LocalTime::today();
        [$from, $to] = match ($period['when']) {
            'today' => [$today, $today->addDay()],
            'yesterday' => [$today->subDay(), $today],
            'week' => [$today->subDays(6), $today->addDay()],
            'month' => [$today->startOfMonth(), $today->addDay()],
            'day' => [LocalTime::day((string) $period['date']), LocalTime::day((string) $period['date'])->addDay()],
            default => [null, null],
        };

        if ($period['when'] === 'all') {
            return $query->where($timeColumn, '>=', self::archiveCutoff());
        }
        if ($period['when'] === 'archive') {
            return $query->where($timeColumn, '<', self::archiveCutoff());
        }

        return $from === null ? $query : $query->where($timeColumn, '>=', $from->utc())->where($timeColumn, '<', $to->utc());
    }

    /**
     * The same, but work still open is never hidden: it is listed whatever its
     * day, so a cart from yesterday does not vanish under "Today". (Outside
     * open hours is a review of what happened then, so it stays strict.)
     *
     * @template T of EloquentContract|Builder
     *
     * @param  T  $query
     * @param  Closure(mixed): mixed  $open  adds the "still open" conditions to the group it is given
     * @param  array<int, int>|null  $storeIds
     * @param  array{when: string, date: string|null}  $period
     * @return T
     */
    public function applyKeepingOpen($query, string|Expression $timeColumn, string|Expression $storeColumn, ?array $storeIds, array $period, Closure $open)
    {
        if ($period['when'] === 'outside') {
            return $this->apply($query, $timeColumn, $storeColumn, $storeIds, $period);
        }

        // The archive holds finished work only: open work is never archived, however old.
        if ($period['when'] === 'archive') {
            return $this->apply($query->whereNot(fn ($group) => $open($group)), $timeColumn, $storeColumn, $storeIds, $period);
        }

        return $query->where(function ($group) use ($open, $timeColumn, $storeColumn, $storeIds, $period): void {
            $open($group);
            $group->orWhere(fn ($done) => $this->apply($done, $timeColumn, $storeColumn, $storeIds, $period));
        });
    }

    /**
     * For lists of work still open (carts, payments to confirm, orders to
     * pick): narrows by when each item started. "All" (the default) shows
     * everything, and open work has no archive.
     *
     * @template T of EloquentContract|Builder
     *
     * @param  T  $query
     * @param  array<int, int>|null  $storeIds
     * @param  array{when: string, date: string|null}  $period
     * @return T
     */
    public function applyToOpen($query, string|Expression $timeColumn, string|Expression $storeColumn, ?array $storeIds, array $period)
    {
        return in_array($period['when'], ['all', 'archive'], true)
            ? $query
            : $this->apply($query, $timeColumn, $storeColumn, $storeIds, $period);
    }

    /**
     * The same rule for rows already built (arrays): a test that says whether
     * a row of a store, started at a moment, belongs in the period. "All"
     * keeps every row; open work has no archive.
     *
     * @param  array{when: string, date: string|null}  $period
     * @return Closure(int|null, CarbonInterface|string|null): bool
     */
    public function matcher(array $period, ?array $storeIds = null): Closure
    {
        $when = $period['when'];

        if (in_array($when, ['all', 'archive'], true)) {
            return fn (): bool => true;
        }

        $instant = fn (CarbonInterface|string|null $at): ?CarbonImmutable => $at === null ? null : CarbonImmutable::parse($at)->utc();

        if ($when === 'week' || $when === 'month') {
            $from = LocalTime::startOf($when === 'week' ? LocalTime::today()->subDays(6) : LocalTime::today()->startOfMonth());

            return fn (?int $storeId, CarbonInterface|string|null $at): bool => ($moment = $instant($at)) !== null && $moment->gte($from);
        }

        if ($when === 'outside') {
            $book = app(DayBook::class);
            $from = LocalTime::startOf(LocalTime::today()->subDays(29));

            return fn (?int $storeId, CarbonInterface|string|null $at): bool => ($moment = $instant($at)) !== null && $moment->gte($from)
                && $storeId !== null && ($book->tag($storeId, $moment)['outside'] ?? false);
        }

        $spans = collect($this->spans($storeIds, $period))->keyBy(0);

        return function (?int $storeId, CarbonInterface|string|null $at) use ($spans, $instant): bool {
            $moment = $instant($at);
            $span = $storeId !== null ? $spans->get($storeId) : null;

            return $moment !== null && $span !== null && $moment->gte($span[1]) && ($span[2] === null || $moment->lte($span[2]));
        };
    }

    /**
     * What the filter shows, for the chips: the options, the choice, and the
     * day it means (stores that did not open that day simply show nothing).
     *
     * @param  array{when: string, date: string|null}  $period
     * @param  bool  $openWork  a list of work still open (no archive; the default is "All")
     * @return array{when: string, date: string|null, archive_after_days: int, options: list<array{key: string, label: string}>}
     */
    public function describe(array $period, bool $openWork = false): array
    {
        // Open work has no archive, and its default shows everything: "All", not "Recent".
        $labels = $openWork
            ? array_merge(array_diff_key(self::LABELS, ['all' => true, 'archive' => true]), ['all' => 'All'])
            : self::LABELS;

        return [
            'when' => $period['when'],
            'date' => $period['date'],
            'archive_after_days' => max(1, (int) config('app.archive_after_days', 90)),
            'options' => collect($labels)->map(fn (string $label, string $key): array => ['key' => $key, 'label' => $label])->values()->all(),
        ];
    }

    /**
     * Each store's span for the day the period names.
     *
     * @param  array<int, int>|null  $storeIds
     * @param  array{when: string, date: string|null}  $period
     * @return list<array{0: int, 1: CarbonImmutable, 2: CarbonImmutable|null}>
     */
    private function spans(?array $storeIds, array $period): array
    {
        $today = LocalTime::dateOf();
        $wanted = match ($period['when']) {
            'yesterday' => LocalTime::today()->subDay()->toDateString(),
            'day' => (string) $period['date'],
            default => $today,
        };

        $sites = StockLocation::query()
            ->where('kind', StockLocation::KIND_STORE)
            ->whereNotNull('store_id')
            ->when($storeIds !== null, fn ($q) => $q->whereIn('store_id', $storeIds ?: [0]))
            ->pluck('store_id', 'id');

        $spans = [];

        foreach ($sites as $siteId => $storeId) {
            $site = new StockLocation;
            $site->id = (int) $siteId;

            // Today is the day that is open now (even if it opened before midnight), else today's row.
            $open = $period['when'] === 'today' ? $this->shopDay->current($site) : null;
            $day = $open ?? SiteDay::query()
                ->where('stock_location_id', $siteId)
                ->whereDate('date', $wanted)
                ->whereNotNull('opened_at')
                ->first();

            if ($day === null) {
                continue;
            }

            // Yesterday never includes the day that is still open now.
            if ($period['when'] === 'yesterday' && $day->status === SiteDay::STATUS_OPEN) {
                continue;
            }

            $span = $this->shopDay->span($day);
            $spans[] = [(int) $storeId, $span[0], $span[1]];
        }

        return $spans;
    }
}
