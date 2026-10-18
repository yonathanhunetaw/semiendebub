<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\LeaveRequest;
use App\Models\Workforce\Shift;
use App\Models\Workforce\TimeEntry;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Hours for salaries: per person over a period, from the clock rows (worked
 * time leaves breaks out), the rota (what was planned), overtime (with its
 * rates and the manager's approval, OvertimeService) and approved leave
 * (days, clipped to the period). Read only; downloaded as CSV.
 */
class HoursReport
{
    public function __construct(private readonly OvertimeService $overtime)
    {
    }

    public const SUMMARY_COLUMNS = [
        'Person', 'Role', 'Sites', 'Days worked', 'Hours worked', 'Break hours', 'Hours planned',
        'Overtime hours', 'Overtime paid hours', 'Overtime pay (hours × rate)', 'Overtime waiting approval hours',
        'Late', 'Left early', 'Without a shift', 'Closed by the system, not checked',
        'Annual leave days', 'Sick days', 'Unpaid days', 'Other leave days',
    ];

    public const DETAIL_COLUMNS = [
        'Date', 'Person', 'Site', 'Clock in', 'Clock out', 'Hours worked', 'Break minutes',
        'Shift', 'Flags', 'In by', 'Out by', 'Note',
    ];

    /**
     * One row per person.
     *
     * @param  Collection<int, StockLocation>  $sites
     * @return array<int, array<int, string|int|float>>
     */
    public function summary(Collection $sites, CarbonInterface $from, CarbonInterface $to): array
    {
        [$start, $end] = $this->bounds($from, $to);
        [$firstDay, $lastDay] = [LocalTime::dateText($from), LocalTime::dateText($to)];
        $siteIds = $sites->pluck('id')->all();

        $entries = TimeEntry::query()->with(['user.roles', 'site', 'breaks'])
            ->whereIn('stock_location_id', $siteIds)
            ->where('clock_in_at', '>=', $start)
            ->where('clock_in_at', '<', $end)
            ->get();

        $shifts = Shift::query()->sent()
            ->whereIn('stock_location_id', $siteIds)
            ->where('starts_at', '>=', $start)
            ->where('starts_at', '<', $end)
            ->get();

        $people = $sites->flatMap(fn (StockLocation $site) => app(Sites::class)->people($site))
            ->merge($entries->pluck('user')->filter())
            ->unique('id')
            ->sortBy(fn (User $user): string => $user->first_name.' '.$user->last_name)
            ->values();

        $leave = LeaveRequest::query()
            ->whereIn('user_id', $people->pluck('id'))
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->overlapping($firstDay, $lastDay)
            ->get();

        $overtime = collect($this->overtime->forSites($sites, $firstDay, $lastDay))->groupBy('user_id');

        return $people->map(function (User $user) use ($entries, $shifts, $leave, $firstDay, $lastDay, $overtime): array {
            $extra = $overtime->get($user->id, collect());
            $mine = $entries->where('user_id', $user->id);
            $flag = fn (string $flag): int => $mine->filter(fn (TimeEntry $entry): bool => $entry->hasFlag($flag))->count();
            $leaveDays = fn (string $type): int => $leave->where('user_id', $user->id)->where('type', $type)
                ->sum(fn (LeaveRequest $request): int => $this->clippedDays($request, $firstDay, $lastDay));

            return [
                trim($user->first_name.' '.$user->last_name),
                $user->role,
                $mine->pluck('site.name')->filter()->unique()->join(', '),
                $mine->map(fn (TimeEntry $entry): string => LocalTime::dateOf($entry->clock_in_at))->unique()->count(),
                $this->hours((int) $mine->sum(fn (TimeEntry $entry): int => (int) $entry->workedMinutes())),
                $this->hours((int) $mine->sum(fn (TimeEntry $entry): int => $entry->breakMinutes())),
                $this->hours((int) $shifts->where('user_id', $user->id)->sum(fn (Shift $shift): int => (int) $shift->starts_at->diffInMinutes($shift->ends_at))),
                $this->hours((int) $extra->sum('overtime')),
                $this->hours((int) $extra->sum('paid_minutes')),
                round((float) $extra->sum('paid_weighted_hours'), 2),
                $this->hours((int) $extra->where('status', 'pending')->sum('overtime')),
                $flag(TimeEntry::FLAG_LATE),
                $flag(TimeEntry::FLAG_EARLY_LEAVE),
                $flag(TimeEntry::FLAG_UNSCHEDULED),
                $mine->filter(fn (TimeEntry $entry): bool => $entry->hasFlag(TimeEntry::FLAG_AUTO_CLOSED) && $entry->reviewed_at === null)->count(),
                $leaveDays('annual'),
                $leaveDays('sick'),
                $leaveDays('unpaid'),
                $leaveDays('other'),
            ];
        })->all();
    }

    /**
     * One row per clock-in.
     *
     * @param  Collection<int, StockLocation>  $sites
     * @return array<int, array<int, string|int|float>>
     */
    public function detail(Collection $sites, CarbonInterface $from, CarbonInterface $to): array
    {
        [$start, $end] = $this->bounds($from, $to);
        $names = fn (?int $id): string => $id ? (string) (User::query()->find($id)?->first_name ?? '') : '';

        return TimeEntry::query()->with(['user', 'site', 'shift', 'breaks'])
            ->whereIn('stock_location_id', $sites->pluck('id'))
            ->where('clock_in_at', '>=', $start)
            ->where('clock_in_at', '<', $end)
            ->orderBy('clock_in_at')
            ->get()
            ->map(fn (TimeEntry $entry): array => [
                LocalTime::dateOf($entry->clock_in_at),
                trim(($entry->user?->first_name ?? '').' '.($entry->user?->last_name ?? '')),
                $entry->site?->name ?? '',
                LocalTime::wall($entry->clock_in_at, 'H:i'),
                LocalTime::wall($entry->clock_out_at, 'H:i') ?? 'still in',
                $entry->workedMinutes() === null ? '' : $this->hours((int) $entry->workedMinutes()),
                $entry->breakMinutes(),
                $entry->shift ? LocalTime::wall($entry->shift->starts_at, 'H:i').'–'.LocalTime::wall($entry->shift->ends_at, 'H:i') : '',
                implode(' ', $entry->flags ?? []),
                $names($entry->in_by),
                $names($entry->out_by),
                (string) $entry->note,
            ])->all();
    }

    /**
     * @param  array<int, string>  $header
     * @param  array<int, array<int, string|int|float>>  $rows
     */
    public function csv(array $header, array $rows): string
    {
        $out = fopen('php://temp', 'r+');
        // Excel opens UTF-8 (Amharic names) correctly with a BOM.
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, $header, ',', '"', '');

        foreach ($rows as $row) {
            fputcsv($out, array_map(fn ($cell) => is_string($cell) && preg_match('/^[=+\-@]/', $cell) ? "'".$cell : $cell, $row), ',', '"', '');
        }

        rewind($out);
        $csv = (string) stream_get_contents($out);
        fclose($out);

        return $csv;
    }

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} the shops' midnight starting the first day, and after the last (UTC) */
    private function bounds(CarbonInterface $from, CarbonInterface $to): array
    {
        return [LocalTime::startOf($from), LocalTime::startOf($to)->addDay()];
    }

    /** Leave days inside the period, both ends counted. */
    private function clippedDays(LeaveRequest $leave, string $firstDay, string $lastDay): int
    {
        $from = CarbonImmutable::parse(max($leave->starts_on->toDateString(), $firstDay));
        $to = CarbonImmutable::parse(min($leave->ends_on->toDateString(), $lastDay));

        return $to->lessThan($from) ? 0 : (int) $from->diffInDays($to) + 1;
    }

    private function hours(int $minutes): float
    {
        return round($minutes / 60, 2);
    }
}
