<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\OvertimeApproval;
use App\Models\Workforce\OvertimeSetting;
use App\Models\Workforce\PublicHoliday;
use App\Models\Workforce\TimeBreak;
use App\Models\Workforce\TimeEntry;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Overtime, worked out from the clock rows of one person on one (shops') day.
 *
 *   - Worked time is clocked-in time less breaks, across every site that day.
 *   - On a public holiday every worked minute is overtime at the holiday rate;
 *     on the weekly rest day, at the rest-day rate.
 *   - Any other day, the first `daily_minutes` are normal time and the rest is
 *     overtime: at the night rate inside the night window, else the day rate.
 *   - When the rules say so, a manager of a site they worked at approves each
 *     person-day (never their own). Only approved overtime is paid; if the clock
 *     rows change after a decision, the day asks again.
 *
 * Rates and rules: OvertimeSetting (a global admin changes them).
 */
class OvertimeService
{
    public function __construct(private readonly Sites $sites)
    {
    }

    public function settings(): OvertimeSetting
    {
        return OvertimeSetting::query()->first() ?? OvertimeSetting::query()->create([
            'daily_minutes' => 480,
            'rate_day' => 1.5,
            'rate_night' => 1.75,
            'rate_rest_day' => 2.0,
            'rate_holiday' => 2.5,
            'night_from' => '22:00',
            'night_to' => '06:00',
            'rest_weekday' => 0,
            'needs_approval' => true,
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     *
     * @throws WorkforceException
     */
    public function saveSettings(User $by, array $data): OvertimeSetting
    {
        $this->mustBeGlobal($by);
        $settings = $this->settings();
        $settings->update([
            'daily_minutes' => (int) round(((float) $data['daily_hours']) * 60),
            'rate_day' => (float) $data['rate_day'],
            'rate_night' => (float) $data['rate_night'],
            'rate_rest_day' => (float) $data['rate_rest_day'],
            'rate_holiday' => (float) $data['rate_holiday'],
            'night_from' => (string) $data['night_from'],
            'night_to' => (string) $data['night_to'],
            'rest_weekday' => (int) $data['rest_weekday'],
            'needs_approval' => (bool) $data['needs_approval'],
            'updated_by' => $by->id,
        ]);

        return $settings;
    }

    /** @throws WorkforceException */
    public function addHoliday(User $by, string $date, string $name): PublicHoliday
    {
        $this->mustBeGlobal($by);

        return PublicHoliday::query()->updateOrCreate(['date' => $date], ['name' => trim($name)]);
    }

    /** @throws WorkforceException */
    public function removeHoliday(User $by, PublicHoliday $holiday): void
    {
        $this->mustBeGlobal($by);
        $holiday->delete();
    }

    /**
     * One person's day: worked, normal and overtime minutes by kind, the
     * weighted (pay) hours, and the manager's decision.
     *
     * @param  Collection<int, TimeEntry>|null  $entries  their closed clock rows that day (loaded when null)
     * @return array<string, mixed>
     */
    public function day(int $userId, string $date, ?Collection $entries = null): array
    {
        $settings = $this->settings();
        $entries ??= $this->entriesOn($userId, $date);
        $segments = $this->segments($entries);
        $worked = (int) array_sum(array_map(fn (array $s): int => (int) $s[0]->diffInMinutes($s[1]), $segments));

        $minutes = ['day' => 0, 'night' => 0, 'rest_day' => 0, 'holiday' => 0];
        $holiday = PublicHoliday::query()->whereDate('date', $date)->value('name');

        if ($holiday !== null) {
            $minutes['holiday'] = $worked;
        } elseif (LocalTime::day($date)->dayOfWeek === (int) $settings->rest_weekday) {
            $minutes['rest_day'] = $worked;
        } else {
            $normal = (int) $settings->daily_minutes;
            foreach ($segments as [$from, $to]) {
                for ($t = $from; $t->lessThan($to); $t = $t->addMinute()) {
                    if ($normal > 0) {
                        $normal--;

                        continue;
                    }

                    $minutes[$this->isNight($t, $settings) ? 'night' : 'day']++;
                }
            }
        }

        $overtime = array_sum($minutes);
        $decision = $overtime > 0 ? OvertimeApproval::query()->with('decider')->where('user_id', $userId)->whereDate('date', $date)->first() : null;
        $current = $decision !== null && (int) $decision->minutes === $overtime;
        $status = ! $settings->needs_approval ? 'not_needed' : ($current ? $decision->status : 'pending');
        $paid = in_array($status, ['not_needed', OvertimeApproval::STATUS_APPROVED], true);

        $weighted = ($minutes['day'] * $settings->rate_day + $minutes['night'] * $settings->rate_night
            + $minutes['rest_day'] * $settings->rate_rest_day + $minutes['holiday'] * $settings->rate_holiday) / 60;

        return [
            'user_id' => $userId,
            'date' => $date,
            'holiday' => $holiday,
            'worked' => $worked,
            'normal' => $worked - $overtime,
            'overtime' => $overtime,
            'minutes' => $minutes,
            // Overtime hours times their rates: what the overtime is paid as, in hours of normal pay.
            'weighted_hours' => round($weighted, 2),
            'status' => $status,
            'paid_minutes' => $paid ? $overtime : 0,
            'paid_weighted_hours' => $paid ? round($weighted, 2) : 0.0,
            'decided_by' => $current ? ($decision->decider ? trim($decision->decider->first_name.' '.$decision->decider->last_name) : null) : null,
            'note' => $current ? $decision->note : null,
        ];
    }

    /**
     * Every person-day with overtime at these sites between two dates.
     *
     * @param  Collection<int, StockLocation>  $sites
     * @return array<int, array<string, mixed>>
     */
    public function forSites(Collection $sites, CarbonInterface|string $from, CarbonInterface|string $to): array
    {
        $entries = TimeEntry::query()->with(['breaks', 'user'])
            ->whereNotNull('clock_out_at')
            ->where('clock_in_at', '>=', LocalTime::startOf($from))
            ->where('clock_in_at', '<', LocalTime::startOf($to)->addDay())
            ->whereIn('user_id', TimeEntry::query()->whereIn('stock_location_id', $sites->pluck('id'))->select('user_id'))
            ->orderBy('clock_in_at')
            ->get();

        return $entries
            ->groupBy(fn (TimeEntry $entry): string => $entry->user_id.'@'.LocalTime::dateOf($entry->clock_in_at))
            ->filter(fn (Collection $rows): bool => $rows->contains(fn (TimeEntry $entry): bool => $sites->contains('id', $entry->stock_location_id)))
            ->map(function (Collection $rows): array {
                $first = $rows->first();
                $day = $this->day((int) $first->user_id, LocalTime::dateOf($first->clock_in_at), $rows);

                return $day + ['name' => trim(($first->user?->first_name ?? '').' '.($first->user?->last_name ?? ''))];
            })
            ->filter(fn (array $day): bool => $day['overtime'] > 0)
            ->sortBy(fn (array $day): string => $day['date'].$day['name'])
            ->values()
            ->all();
    }

    /** @throws WorkforceException */
    public function approve(User $manager, User $user, string $date, ?string $note = null): OvertimeApproval
    {
        return $this->decide($manager, $user, $date, OvertimeApproval::STATUS_APPROVED, $note);
    }

    /** @throws WorkforceException */
    public function reject(User $manager, User $user, string $date, string $note): OvertimeApproval
    {
        if (trim($note) === '') {
            throw new WorkforceException('Say why the overtime is not paid.');
        }

        return $this->decide($manager, $user, $date, OvertimeApproval::STATUS_REJECTED, $note);
    }

    /** May this person decide on that person-day: a manager of a site they worked at, not themselves? */
    public function mayDecide(User $manager, int $userId, string $date): bool
    {
        if ((int) $manager->id === $userId) {
            return false;
        }

        if ($this->sites->isGlobalAdmin($manager)) {
            return true;
        }

        return $this->entriesOn($userId, $date)->contains(fn (TimeEntry $entry): bool => $entry->site !== null && $this->sites->canManage($manager, $entry->site));
    }

    /** @throws WorkforceException */
    private function decide(User $manager, User $user, string $date, string $status, ?string $note): OvertimeApproval
    {
        if ((int) $manager->id === (int) $user->id) {
            throw new WorkforceException('Someone else decides on your own overtime.', 403);
        }

        if (! $this->mayDecide($manager, (int) $user->id, $date)) {
            throw new WorkforceException('Only a manager of a site they worked at decides on their overtime.', 403);
        }

        $day = $this->day((int) $user->id, $date);
        if ($day['overtime'] === 0) {
            throw new WorkforceException('There is no overtime that day.');
        }

        return OvertimeApproval::query()->updateOrCreate(
            ['user_id' => $user->id, 'date' => $date],
            ['status' => $status, 'minutes' => $day['overtime'], 'decided_by' => $manager->id, 'note' => $note !== null && trim($note) !== '' ? trim($note) : null],
        );
    }

    /** @return Collection<int, TimeEntry> */
    private function entriesOn(int $userId, string $date): Collection
    {
        return TimeEntry::query()->with(['breaks', 'site'])
            ->where('user_id', $userId)
            ->whereNotNull('clock_out_at')
            ->where('clock_in_at', '>=', LocalTime::startOf($date))
            ->where('clock_in_at', '<', LocalTime::startOf($date)->addDay())
            ->orderBy('clock_in_at')
            ->get();
    }

    /**
     * Worked stretches (clocked in, not on a break), in order.
     *
     * @param  Collection<int, TimeEntry>  $entries
     * @return array<int, array{0: CarbonImmutable, 1: CarbonImmutable}>
     */
    private function segments(Collection $entries): array
    {
        $segments = [];

        foreach ($entries->sortBy('clock_in_at') as $entry) {
            if ($entry->clock_out_at === null) {
                continue;
            }

            $cursor = CarbonImmutable::instance($entry->clock_in_at)->startOfMinute();
            $end = CarbonImmutable::instance($entry->clock_out_at)->startOfMinute();

            foreach ($entry->breaks->sortBy('started_at') as $break) {
                /** @var TimeBreak $break */
                $from = CarbonImmutable::instance($break->started_at)->startOfMinute()->max($cursor)->min($end);
                $to = CarbonImmutable::instance($break->ended_at ?? $entry->clock_out_at)->startOfMinute()->max($from)->min($end);

                if ($from->greaterThan($cursor)) {
                    $segments[] = [$cursor, $from];
                }
                $cursor = $to;
            }

            if ($end->greaterThan($cursor)) {
                $segments[] = [$cursor, $end];
            }
        }

        return $segments;
    }

    private function isNight(CarbonImmutable $instant, OvertimeSetting $settings): bool
    {
        $at = LocalTime::wall($instant, 'H:i');
        $from = substr((string) $settings->night_from, 0, 5);
        $to = substr((string) $settings->night_to, 0, 5);

        return $from > $to ? ($at >= $from || $at < $to) : ($at >= $from && $at < $to);
    }

    /** @throws WorkforceException */
    private function mustBeGlobal(User $by): void
    {
        if (! $this->sites->isGlobalAdmin($by)) {
            throw new WorkforceException('Only a global admin changes the overtime rules.', 403);
        }
    }
}
