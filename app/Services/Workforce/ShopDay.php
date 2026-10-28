<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Models\Inventory\StockLocation;
use App\Models\Workforce\SiteDay;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Database\Query\Expression;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;

/**
 * A store's business day: from the moment it opened to the moment it closed.
 *
 * A day does not end at midnight; it ends when the shop closes (so a sale at
 * 01:00 in a shop still open is that day's). The day is the store's SiteDay
 * row, dated by its opening date, with `opened_at` and `closed_at` as UTC
 * instants. A closed day is final.
 *
 * Anything that happens while a store is not open (an online order at 03:00, a
 * sale in a shop that never opened) belongs to no day. It is "outside open
 * hours": listed on its own, never added to a closed day.
 *
 * Roles with no sales day (Procurement, Finance, the Main Hub) use plain
 * Addis calendar dates through LocalTime instead.
 *
 * SiteDayService keeps at most one open day per site (it refuses to open a
 * second), so the spans never overlap.
 */
final class ShopDay
{
    /** The store's own site: its retail-store stock location. */
    public function siteOf(int $storeId): ?StockLocation
    {
        return StockLocation::query()
            ->where('store_id', $storeId)
            ->where('kind', StockLocation::KIND_STORE)
            ->first();
    }

    /** The day that is open right now (whatever its date), or null when the shop is closed. */
    public function current(StockLocation $site): ?SiteDay
    {
        return SiteDay::query()
            ->where('stock_location_id', $site->id)
            ->where('status', SiteDay::STATUS_OPEN)
            ->orderByDesc('opened_at')
            ->first();
    }

    /** The day an instant falls in, or null when the shop was not open then. */
    public function forInstant(StockLocation $site, CarbonInterface $at): ?SiteDay
    {
        $at = CarbonImmutable::instance($at)->utc();

        $day = SiteDay::query()
            ->where('stock_location_id', $site->id)
            ->whereNotNull('opened_at')
            ->where('opened_at', '<=', $at)
            ->orderByDesc('opened_at')
            ->first();

        if ($day === null || ($day->closed_at !== null && $day->closed_at->lt($at))) {
            return null;
        }

        return $day;
    }

    /**
     * The span of a day as UTC instants: when it opened and when it closed
     * (null while it is still open). Null for a day that never opened.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable|null}|null
     */
    public function span(SiteDay $day): ?array
    {
        if ($day->opened_at === null) {
            return null;
        }

        return [
            CarbonImmutable::instance($day->opened_at)->utc(),
            $day->closed_at !== null ? CarbonImmutable::instance($day->closed_at)->utc() : null,
        ];
    }

    /**
     * Keep only what happened while the day was open.
     *
     * `$column` is the record's time (qualify it: 'sales.created_at').
     *
     * @template T of EloquentBuilder|Builder
     *
     * @param  T  $query
     * @return T
     */
    public function within(EloquentBuilder|Builder $query, string|Expression $column, SiteDay $day): EloquentBuilder|Builder
    {
        $span = $this->span($day);

        if ($span === null) {
            return $query->whereRaw('1 = 0');
        }

        $query->where($column, '>=', $span[0]);

        return $span[1] === null ? $query : $query->where($column, '<=', $span[1]);
    }

    /**
     * Keep only what happened while its own store was not open.
     *
     * `$timeColumn` is the record's time and `$storeColumn` its store, both
     * qualified ('sales.created_at', 'sales.store_id') or a DB::raw expression. Works for one store or
     * for every store at once: each record is judged against its own store's days.
     *
     * @template T of EloquentBuilder|Builder
     *
     * @param  T  $query
     * @return T
     */
    public function outsideHours(EloquentBuilder|Builder $query, string|Expression $timeColumn, string|Expression $storeColumn): EloquentBuilder|Builder
    {
        return $query->whereNotExists(function (Builder $open) use ($timeColumn, $storeColumn): void {
            $open->selectRaw('1')
                ->from('site_days')
                ->join('stock_locations', 'stock_locations.id', '=', 'site_days.stock_location_id')
                ->where('stock_locations.kind', StockLocation::KIND_STORE)
                ->whereColumn('stock_locations.store_id', $storeColumn)
                ->whereNotNull('site_days.opened_at')
                ->whereColumn('site_days.opened_at', '<=', $timeColumn)
                ->where(fn (Builder $end) => $end
                    ->whereNull('site_days.closed_at')
                    ->orWhereColumn('site_days.closed_at', '>=', $timeColumn));
        });
    }

    /**
     * The days a site actually opened on, between two shop dates, oldest first.
     *
     * @return Collection<int, SiteDay>
     */
    public function opened(StockLocation $site, CarbonInterface|string $from, CarbonInterface|string $to): Collection
    {
        return SiteDay::query()
            ->where('stock_location_id', $site->id)
            ->whereNotNull('opened_at')
            ->whereDate('date', '>=', LocalTime::dateText($from))
            ->whereDate('date', '<=', LocalTime::dateText($to))
            ->orderBy('opened_at')
            ->get();
    }

    /**
     * Days still open that opened on an earlier shop date: someone forgot to close.
     *
     * @return Collection<int, SiteDay>
     */
    public function forgottenToClose(): Collection
    {
        return SiteDay::query()
            ->with('site')
            ->where('status', SiteDay::STATUS_OPEN)
            ->whereDate('date', '<', LocalTime::dateOf())
            ->orderBy('opened_at')
            ->get();
    }
}
