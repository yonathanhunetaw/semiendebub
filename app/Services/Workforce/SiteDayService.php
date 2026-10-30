<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\CustodyKey;
use App\Models\Workforce\LeaveRequest;
use App\Models\Workforce\Shift;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\SiteDayAnswer;
use App\Models\Workforce\StaffRide;
use App\Services\Finance\DayCash;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Opening and closing a site, one day at a time.
 *
 *   plan   a manager names who opens, who closes and who drives on a date
 *          (on the Rota page). The driver brings the opener in and takes
 *          the closer home: those two staff rides follow the plan
 *          (StaffRideService::planFor). Without a driver, opening and closing
 *          still go ahead, flagged `no_driver`.
 *   open   at the site: scan the counter QR (the printed one works), hold the
 *          site's key, tick the opening checklist, count the cash float. A
 *          manager without the key may open with a note; it is flagged.
 *          The opener is clocked in.
 *   close  at the site: scan the QR, tick the closing checklist, count the
 *          till, and hand the key to whoever opens next. Refused while
 *          others are clocked in, unless the closer clocks them out too.
 *   sweep  every few minutes: an opening not done by the opening time plus
 *          the site's grace is marked missed (it can still be opened).
 *
 * Only this service changes site_days.status.
 */
class SiteDayService
{
    public function __construct(
        private readonly Sites $sites,
        private readonly CounterQr $qr,
        private readonly KeyCustodyService $keys,
        private readonly AttendanceService $attendance,
        private readonly StaffRideService $rides,
    ) {
    }

    /** The site's row for a date, made on first use from its hours. */
    public function day(StockLocation $site, CarbonInterface $date): SiteDay
    {
        // The shops' date (now() is read on the shops' clock).
        $date = LocalTime::dateText($date);

        $expected = ($this->sites->hoursOn($site, $date)['closed'] ?? false) ? SiteDay::STATUS_CLOSED_DAY : SiteDay::STATUS_PLANNED;
        $day = SiteDay::query()->where('stock_location_id', $site->id)->whereDate('date', $date)->first();

        if ($day === null) {
            return SiteDay::query()->create([
                'stock_location_id' => $site->id,
                'date' => $date,
                'status' => $expected,
            ]);
        }

        // Hours changed since the row was made (a holiday added, say): follow
        // them while nothing has happened on that day yet.
        if (in_array($day->status, [SiteDay::STATUS_PLANNED, SiteDay::STATUS_CLOSED_DAY], true) && $day->status !== $expected) {
            $day->update(['status' => $expected]);
        }

        return $day;
    }

    /**
     * The row for "now" at a site: the day that is open (a shop that opened on
     * the 20th and closes at 00:30 on the 21st is still the 20th's day), else
     * today's row on the shops' calendar.
     */
    public function current(StockLocation $site): SiteDay
    {
        return app(ShopDay::class)->current($site) ?? $this->day($site, now());
    }

    /** @throws WorkforceException */
    public function plan(StockLocation $site, CarbonInterface $date, User $by, ?int $openerId, ?int $closerId, ?int $driverId = null): SiteDay
    {
        if (! $this->sites->canManage($by, $site)) {
            throw new WorkforceException('Only a manager of this site plans who opens and closes it.', 403);
        }

        foreach (array_filter([$openerId, $closerId]) as $id) {
            $person = User::query()->find($id);
            if ($person === null || ! $this->sites->worksAt($person, $site)) {
                throw new WorkforceException('That person does not work at this site.');
            }
        }

        if ($driverId !== null && ! (bool) User::query()->whereKey($driverId)->value('is_driver')) {
            throw new WorkforceException('Pick a driver (someone marked as a driver in Users).');
        }

        // Nobody is planned on a day they are away (as with shifts: RotaService::assertFree).
        foreach (array_unique(array_filter([$openerId, $closerId, $driverId])) as $id) {
            if (LeaveRequest::query()->where('user_id', $id)->where('status', LeaveRequest::STATUS_APPROVED)
                ->overlapping(LocalTime::dateText($date), LocalTime::dateText($date))->exists()) {
                $away = User::query()->find($id);
                throw new WorkforceException(sprintf('%s is on leave that day.', $away ? trim($away->first_name.' '.$away->last_name) : 'That person'));
            }
        }

        return DB::transaction(function () use ($site, $date, $openerId, $closerId, $driverId): SiteDay {
            $day = $this->day($site, $date);
            $day->update(['opener_id' => $openerId, 'closer_id' => $closerId, 'driver_id' => $driverId]);

            // The plan is now the one place: an older shift duty would put its person back.
            Shift::query()->where('stock_location_id', $site->id)
                ->whereBetween('starts_at', [LocalTime::startOf($day->date->toDateString()), LocalTime::startOf($day->date->toDateString())->addDay()])
                ->where('duty', '!=', Shift::DUTY_NONE)
                ->update(['duty' => Shift::DUTY_NONE]);

            $this->planChanged($day);

            return $day;
        });
    }

    /**
     * The opener, closer or driver says whether they will do it: yes, or no with
     * a reason (the manager's bell then asks them to pick someone else). They can
     * change their mind until the duty is done.
     *
     * @throws WorkforceException
     */
    public function answer(SiteDay $day, User $by, string $duty, bool $yes, ?string $note = null): SiteDayAnswer
    {
        if (! in_array($duty, SiteDayAnswer::DUTIES, true)) {
            throw new WorkforceException('Say which job: opening, closing or driving.');
        }

        if ((int) $day->{$duty.'_id'} !== (int) $by->id) {
            throw new WorkforceException('That job is planned for someone else.', 403);
        }

        $done = match ($duty) {
            'opener' => ! in_array($day->status, [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED], true),
            default => ! in_array($day->status, [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED, SiteDay::STATUS_OPEN], true),
        };
        if ($done || ($day->date->toDateString() < LocalTime::dateOf() && $day->status !== SiteDay::STATUS_OPEN)) {
            throw new WorkforceException('That day is done: nothing to answer.');
        }

        $note = $note !== null ? trim($note) : '';
        if (! $yes && $note === '') {
            throw new WorkforceException('Say why you cannot, so the manager can plan around it.');
        }

        return SiteDayAnswer::query()->updateOrCreate(
            ['site_day_id' => $day->id, 'duty' => $duty],
            ['user_id' => $by->id, 'answer' => $yes ? SiteDayAnswer::YES : SiteDayAnswer::NO, 'note' => $yes ? null : $note],
        );
    }

    /**
     * "I can't" answers in the next week at the sites this manager runs, from
     * whoever still holds that duty (nobody else picked yet): for the bell and
     * the Team page. Never their own.
     *
     * @return Collection<int, SiteDayAnswer>
     */
    public function cantDo(User $manager, int $days = 7): Collection
    {
        $today = LocalTime::dateOf();

        return SiteDayAnswer::query()->with(['siteDay.site', 'user'])
            ->where('answer', SiteDayAnswer::NO)
            ->where('user_id', '!=', $manager->id)
            ->whereHas('siteDay', fn ($q) => $q->whereDate('date', '>=', $today)->whereDate('date', '<=', LocalTime::day($today)->addDays($days)->toDateString())
                ->whereIn('status', [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED, SiteDay::STATUS_OPEN]))
            ->get()
            ->filter(fn (SiteDayAnswer $answer): bool => $answer->siteDay?->site !== null
                && (int) $answer->siteDay->{$answer->duty.'_id'} === (int) $answer->user_id
                && $this->sites->canManage($manager, $answer->siteDay->site))
            ->sortBy(fn (SiteDayAnswer $answer): string => $answer->siteDay->date->toDateString())
            ->values()
            ->toBase();
    }

    /**
     * The day's answers that still count: only from whoever holds that duty now
     * (a swap, leave or a new plan leaves the old person's answer behind).
     *
     * @return array<string, array{answer: string, note: string|null, at: string|null}|null>
     */
    public function answersOf(SiteDay $day): array
    {
        $rows = $day->relationLoaded('answers') ? $day->answers : $day->answers()->get();

        return collect(SiteDayAnswer::DUTIES)->mapWithKeys(function (string $duty) use ($day, $rows): array {
            $row = $rows->first(fn (SiteDayAnswer $answer): bool => $answer->duty === $duty && (int) $answer->user_id === (int) $day->{$duty.'_id'});

            return [$duty => $row ? ['answer' => $row->answer, 'note' => $row->note, 'at' => $row->updated_at?->toIso8601String()] : null];
        })->all();
    }

    /**
     * Someone is away (approved leave) between two shops' dates: take them off
     * those days' plans as opener, closer or driver, for days not opened yet.
     * The days' rides follow, and the manager's bell shows what is now missing.
     * Returns how many days changed.
     */
    public function releasePerson(int $userId, CarbonInterface $from, CarbonInterface $to): int
    {
        $days = SiteDay::query()
            ->whereDate('date', '>=', LocalTime::dateText($from))
            ->whereDate('date', '<=', LocalTime::dateText($to))
            ->whereIn('status', [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED])
            ->where(fn ($q) => $q->where('opener_id', $userId)->orWhere('closer_id', $userId)->orWhere('driver_id', $userId))
            ->get();

        foreach ($days as $day) {
            $day->update(collect(['opener_id', 'closer_id', 'driver_id'])
                ->filter(fn (string $column): bool => (int) $day->{$column} === $userId)
                ->mapWithKeys(fn (string $column): array => [$column => null])
                ->all());
            $this->planChanged($day);
        }

        return $days->count();
    }

    /**
     * "Copy last week" for the plan: each day of this week still ahead, with
     * nobody named for a duty, takes last week's same weekday's person for it.
     * Someone who no longer works at the site (or drives), or is on leave that day, is left out; what a
     * manager already named this week is never overwritten. Returns the days changed.
     *
     * @throws WorkforceException
     */
    public function copyWeekPlan(StockLocation $site, User $by, CarbonInterface $weekStart): int
    {
        if (! $this->sites->canManage($by, $site)) {
            throw new WorkforceException('Only a manager of this site plans who opens and closes it.', 403);
        }

        $today = LocalTime::dateOf();
        $start = LocalTime::day($weekStart);
        $copied = 0;

        foreach (range(0, 6) as $i) {
            $date = $start->addDays($i);
            if ($date->toDateString() < $today || ($this->sites->hoursOn($site, $date)['closed'] ?? false)) {
                continue;
            }

            $source = SiteDay::query()->where('stock_location_id', $site->id)->whereDate('date', $date->subWeek()->toDateString())->first();
            if ($source === null || ($source->opener_id === null && $source->closer_id === null && $source->driver_id === null)) {
                continue;
            }

            $day = $this->day($site, $date);
            if (! in_array($day->status, [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED], true)) {
                continue;
            }

            // Still with us that day: works at the site (or still drives), and not on leave.
            $away = fn (int $id): bool => LeaveRequest::query()->where('user_id', $id)->where('status', LeaveRequest::STATUS_APPROVED)
                ->overlapping($date->toDateString(), $date->toDateString())->exists();
            $still = fn (?int $id): ?int => $id !== null && ($person = User::query()->find($id)) !== null && $this->sites->worksAt($person, $site) && ! $away($id) ? $id : null;
            $opener = $day->opener_id ?? $still($source->opener_id);
            $closer = $day->closer_id ?? $still($source->closer_id);
            $driver = $day->driver_id ?? ($source->driver_id !== null && User::query()->whereKey($source->driver_id)->where('is_driver', true)->exists() && ! $away($source->driver_id) ? $source->driver_id : null);

            if ([$opener, $closer, $driver] === [$day->opener_id, $day->closer_id, $day->driver_id]) {
                continue;
            }

            $this->plan($site, $date, $by, $opener, $closer, $driver);
            $copied++;
        }

        return $copied;
    }

    /** Keep the day's opening and closing rides in step after its opener, closer or driver changed. */
    public function planChanged(SiteDay $day): void
    {
        $this->rides->planFor($day->refresh());
    }

    /** People who drive, for picking the day's driver. */
    public function drivers(): Collection
    {
        return User::query()->where('is_driver', true)->orderBy('first_name')->get()
            ->map(fn (User $user): array => ['id' => (int) $user->id, 'name' => trim($user->first_name.' '.$user->last_name)])
            ->values()
            ->toBase();
    }

    /**
     * @param  array<int, string>  $ticked  checklist items done
     *
     * @throws WorkforceException
     */
    public function open(StockLocation $site, User $by, ?string $token, array $ticked = [], ?float $float = null, ?string $note = null): SiteDay
    {
        return DB::transaction(function () use ($site, $by, $token, $ticked, $float, $note): SiteDay {
            $this->atCounter($site, $token);

            if (! $this->sites->worksAt($by, $site)) {
                throw new WorkforceException('You do not work at this site.', 403);
            }

            $earlier = app(ShopDay::class)->current($site);
            if ($earlier !== null && $earlier->date->toDateString() !== LocalTime::dateOf()) {
                // Days never overlap, and a closed day is final: the old one is closed first.
                throw new WorkforceException(sprintf('%s is still open from %s. Close it first; if nobody did, a manager can set when it really closed.', $site->name, $earlier->date->format('l, M j')));
            }

            $day = SiteDay::query()->lockForUpdate()->findOrFail($this->day($site, now())->id);

            if ($day->status === SiteDay::STATUS_OPEN) {
                throw new WorkforceException(sprintf('%s is already open.', $site->name));
            }

            if ($day->status === SiteDay::STATUS_CLOSED) {
                throw new WorkforceException(sprintf('%s was already closed today.', $site->name));
            }

            $key = $this->keys->keyFor($site);
            $holds = (int) $key->holder_id === (int) $by->id;
            $note = $note !== null ? trim($note) : null;

            if (! $holds) {
                if (! $this->sites->canManage($by, $site)) {
                    throw new WorkforceException(sprintf(
                        'You do not hold the key. %s — ask them to hand it to you first.',
                        $key->holder ? trim($key->holder->first_name.' '.$key->holder->last_name).' holds it' : 'Nobody holds it yet',
                    ));
                }

                if ($note === null || $note === '') {
                    throw new WorkforceException('You do not hold the key: say how you opened (spare from the owner, door was open…).');
                }
            }

            // No driver planned, or the opener's pick-up never set off: it opens, flagged for the manager.
            $pickup = $this->rides->plannedFor($day)->get(StaffRide::PURPOSE_OPENING);
            $noDriver = $day->driver_id === null || $pickup === null || ! in_array($pickup->status, [StaffRide::STATUS_DEPARTED, StaffRide::STATUS_DONE], true);

            $day->update([
                'status' => SiteDay::STATUS_OPEN,
                'opened_at' => now(),
                'opened_by' => $by->id,
                'opened_without_key' => ! $holds,
                'no_driver' => $noDriver,
                'open_checklist' => $this->ticks($this->qr->settings($site)->openingItems(), $ticked),
                'float_amount' => $float,
                'open_note' => $note ?: null,
            ]);

            $this->attendance->clockInOpener($by, $site);

            return $day;
        });
    }

    /**
     * @param  array<int, string>  $ticked
     *
     * @throws WorkforceException
     */
    public function close(StockLocation $site, User $by, ?string $token, array $ticked = [], ?float $till = null, ?string $note = null, ?User $keyTo = null, bool $clockOutOthers = false, ?string $differenceNote = null): SiteDay
    {
        return DB::transaction(function () use ($site, $by, $token, $ticked, $till, $note, $keyTo, $clockOutOthers, $differenceNote): SiteDay {
            $this->atCounter($site, $token);

            if (! $this->sites->worksAt($by, $site)) {
                throw new WorkforceException('You do not work at this site.', 403);
            }

            $day = SiteDay::query()->lockForUpdate()->findOrFail($this->current($site)->id);

            if ($day->status !== SiteDay::STATUS_OPEN) {
                throw new WorkforceException(sprintf('%s is not open, so it cannot be closed.', $site->name));
            }

            $others = $this->attendance->stillIn($site, $by);
            if ($others->isNotEmpty() && ! $clockOutOthers) {
                throw new WorkforceException(sprintf(
                    'Still clocked in: %s. They clock out first, or tick “clock them out” to do it as you close.',
                    $others->map(fn ($entry): string => $entry->user?->first_name ?? '?')->join(', '),
                ));
            }

            // The day's cash is settled before anything changes: a till that does not
            // match, with no reason given, stops the closing (nothing is half-closed).
            $money = app(DayCash::class);
            $settled = $money->settle($money->figures($site, $day, now()), $till, $differenceNote);

            $day->update([
                'status' => SiteDay::STATUS_CLOSED,
                'closed_at' => now(),
                'closed_by' => $by->id,
                'close_checklist' => $this->ticks($this->qr->settings($site)->closingItems(), $ticked),
                'no_driver' => $day->no_driver || $day->driver_id === null,
                'till_count' => $till,
                'close_note' => $note !== null && trim($note) !== '' ? trim($note) : null,
            ] + $settled);

            $this->attendance->clockOutAtClosing($site, $by);

            if ($keyTo !== null && (int) $keyTo->id !== (int) $by->id) {
                $this->keys->handOver($this->keys->keyFor($site), $by, $keyTo, 'closing');
            }

            return $day;
        });
    }

    /**
     * A manager closes a day nobody closed: the shop opened on an earlier date
     * and was never closed at the counter. They say when it really closed and
     * count the till. Sales after that moment fall outside open hours; the day
     * is then final like any other.
     *
     * @throws WorkforceException
     */
    public function closeLate(StockLocation $site, User $by, CarbonInterface $closedAt, ?float $till, string $note, ?string $differenceNote = null): SiteDay
    {
        if (! $this->sites->canManage($by, $site)) {
            throw new WorkforceException('Only a manager of this site closes a day afterwards.', 403);
        }

        $note = trim($note);
        if ($note === '') {
            throw new WorkforceException('Say why it was not closed at the counter.');
        }

        return DB::transaction(function () use ($site, $by, $closedAt, $till, $note, $differenceNote): SiteDay {
            $open = app(ShopDay::class)->current($site);
            $open = $open === null ? null : SiteDay::query()->lockForUpdate()->find($open->id);

            if ($open === null || $open->status !== SiteDay::STATUS_OPEN || $open->date->toDateString() >= LocalTime::dateOf()) {
                throw new WorkforceException(sprintf('%s has no earlier day left open.', $site->name));
            }

            $closedAt = CarbonImmutable::instance($closedAt)->utc();
            if ($closedAt->lt($open->opened_at) || $closedAt->gt(now())) {
                throw new WorkforceException('The closing time has to be after it opened and not in the future.');
            }

            // Its cash is the cash up to the moment the shop really closed.
            $money = app(DayCash::class);
            $settled = $money->settle($money->figures($site, $open, $closedAt), $till, $differenceNote);

            $open->update([
                'status' => SiteDay::STATUS_CLOSED,
                'closed_at' => $closedAt,
                'closed_by' => $by->id,
                'closed_late' => true,
                'no_driver' => $open->no_driver || $open->driver_id === null,
                'till_count' => $till,
                'close_note' => $note,
            ] + $settled);

            $this->attendance->clockOutAtClosing($site, $by, $closedAt);

            return $open;
        });
    }

    /**
     * Mark openings not done in time as missed. Returns how many it marked.
     */
    public function sweep(?CarbonInterface $now = null): int
    {
        $now = CarbonImmutable::instance($now ?? now())->utc();
        $marked = 0;

        foreach ($this->sites->query()->get() as $site) {
            $opens = $this->sites->opensAt($site, $now);
            if ($opens === null) {
                continue;
            }

            $grace = (int) $this->qr->settings($site)->open_grace_minutes;
            if ($now->lessThan($opens->addMinutes($grace))) {
                continue;
            }

            $day = $this->day($site, $now);
            if ($day->status === SiteDay::STATUS_PLANNED) {
                $day->update(['status' => SiteDay::STATUS_MISSED, 'missed_at' => $now]);
                $marked++;
            }
        }

        return $marked;
    }

    /**
     * The next day after this one with a planned opener, for "hand the key on".
     */
    public function nextPlannedOpening(StockLocation $site, CarbonInterface $after): ?SiteDay
    {
        return SiteDay::query()->with('opener')
            ->where('stock_location_id', $site->id)
            ->whereDate('date', '>', LocalTime::dateText($after))
            ->whereDate('date', '<=', LocalTime::day($after)->addDays(7)->toDateString())
            ->whereNotNull('opener_id')
            ->whereIn('status', [SiteDay::STATUS_PLANNED])
            ->orderBy('date')
            ->first();
    }

    /**
     * Today at each site this person works at.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function todayFor(User $user): Collection
    {
        return $this->sites->workedAtBy($user)
            ->map(fn (StockLocation $site): array => $this->present($site, $this->current($site), $user))
            ->values()
            ->toBase();
    }

    /**
     * The days this person opens, closes or drives, from today (or the day still
     * open) for a week: what My work turns into steps. Only days still to do.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function dutiesFor(User $user, int $days = 7): Collection
    {
        $today = LocalTime::dateOf();

        return SiteDay::query()->with('site')
            ->where(fn ($query) => $query->where('opener_id', $user->id)->orWhere('closer_id', $user->id)->orWhere('driver_id', $user->id))
            ->where(fn ($query) => $query
                ->where(fn ($ahead) => $ahead->whereDate('date', '>=', $today)->whereDate('date', '<=', LocalTime::day($today)->addDays($days)->toDateString())
                    ->whereIn('status', [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED, SiteDay::STATUS_OPEN]))
                // A day opened earlier and not closed yet still has its closing to do.
                ->orWhere(fn ($open) => $open->where('status', SiteDay::STATUS_OPEN)->whereDate('date', '<', $today)))
            ->orderBy('date')
            ->get()
            ->filter(fn (SiteDay $day): bool => $day->site !== null)
            ->map(function (SiteDay $day) use ($user, $today): array {
                $mine = fn (string $column): bool => (int) $day->{$column} === (int) $user->id;
                $roles = array_values(array_filter([
                    // Opening is done once the day is open; closing and driving are not.
                    $mine('opener_id') && $day->status !== SiteDay::STATUS_OPEN ? 'opener' : null,
                    $mine('closer_id') ? 'closer' : null,
                    $mine('driver_id') ? 'driver' : null,
                ]));

                return $this->present($day->site, $day, $user) + [
                    'my_roles' => $roles,
                    'is_today' => $day->date->toDateString() <= $today,
                ];
            })
            ->filter(fn (array $duty): bool => $duty['my_roles'] !== [])
            ->values()
            ->toBase();
    }

    /**
     * A week of plans for these sites, for one glance: who opens, closes and
     * drives each day, whether they said yes, and what is missing. Read-only
     * (it runs on My work and the dashboard): a day with no row yet shows as
     * its hours say, nobody named.
     *
     * @param  Collection<int, StockLocation>  $sites
     * @return array<int, array<string, mixed>>
     */
    public function weekPlan(Collection $sites, int $days = 7): array
    {
        if ($sites->isEmpty()) {
            return [];
        }

        $start = LocalTime::day(LocalTime::dateOf());
        $rows = SiteDay::query()->with(['opener', 'closer', 'driver', 'answers'])
            ->whereIn('stock_location_id', $sites->pluck('id'))
            ->whereDate('date', '>=', $start->toDateString())
            ->whereDate('date', '<', $start->addDays($days)->toDateString())
            ->get()
            ->keyBy(fn (SiteDay $day): string => $day->stock_location_id.'@'.$day->date->toDateString());
        $name = fn (?User $user): ?string => $user ? trim($user->first_name.' '.$user->last_name) : null;

        return $sites->map(fn (StockLocation $site): array => [
            'site' => ['id' => (int) $site->id, 'name' => $site->name, 'kind' => $site->kind, 'kind_label' => $site->kind_label],
            'days' => collect(range(0, $days - 1))->map(function (int $i) use ($site, $start, $name, $rows): array {
                $date = $start->addDays($i)->toDateString();
                $day = $rows->get($site->id.'@'.$date);
                $hours = $this->sites->hoursOn($site, $date);
                $answers = $day ? $this->answersOf($day) : ['opener' => null, 'closer' => null, 'driver' => null];

                return [
                    'date' => $date,
                    'status' => $day?->status ?? (($hours['closed'] ?? false) ? SiteDay::STATUS_CLOSED_DAY : SiteDay::STATUS_PLANNED),
                    'opens_at' => $hours['opens_at'] ?? null,
                    'closes_at' => $hours['closes_at'] ?? null,
                    'no_hours' => $hours === null,
                    'opener' => $name($day?->opener),
                    'closer' => $name($day?->closer),
                    'driver' => $name($day?->driver),
                    'answers' => array_map(fn (?array $answer): ?string => $answer['answer'] ?? null, $answers),
                ];
            })->all(),
        ])->values()->all();
    }

    /** @return array<string, mixed> */
    public function present(StockLocation $site, SiteDay $day, User $viewer): array
    {
        $day->loadMissing(['opener', 'closer', 'driver', 'openedBy', 'closedBy', 'answers']);
        $settings = $this->qr->settings($site);
        $key = CustodyKey::query()->with('holder')->where('keyable_type', StockLocation::class)->where('keyable_id', $site->id)->first();
        $manages = $this->sites->canManage($viewer, $site);
        $name = fn (?User $user): ?string => $user ? trim($user->first_name.' '.$user->last_name) : null;
        $hours = $this->sites->hoursOn($site, $day->date);

        return [
            'site' => ['id' => (int) $site->id, 'name' => $site->name, 'kind' => $site->kind, 'kind_label' => $site->kind_label],
            'id' => (int) $day->id,
            'date' => $day->date->toDateString(),
            'status' => $day->status,
            'hours' => $hours,
            'opener' => $day->opener ? ['id' => (int) $day->opener->id, 'name' => $name($day->opener)] : null,
            'closer' => $day->closer ? ['id' => (int) $day->closer->id, 'name' => $name($day->closer)] : null,
            'driver' => $day->driver ? ['id' => (int) $day->driver->id, 'name' => $name($day->driver)] : null,
            'no_driver' => (bool) $day->no_driver,
            // Will they do it: each duty's yes / no (with why), or null while unanswered.
            'answers' => $this->answersOf($day),
            // The driver's two runs: the opener's pick-up and the closer's ride home.
            'rides' => $this->rides->plannedFor($day)->map(fn (StaffRide $ride): array => [
                'id' => (int) $ride->id,
                'purpose' => $ride->purpose,
                'departs_at' => LocalTime::wall($ride->departs_at),
                'status' => $ride->status,
            ])->values()->all(),
            'opened_at' => $day->opened_at?->toIso8601String(),
            'opened_by' => $name($day->openedBy),
            'i_opened' => $day->opened_by !== null && (int) $day->opened_by === (int) $viewer->id,
            'opened_without_key' => (bool) $day->opened_without_key,
            'float_amount' => $day->float_amount !== null ? (float) $day->float_amount : null,
            'open_note' => $day->open_note,
            'closed_at' => $day->closed_at?->toIso8601String(),
            'closed_late' => (bool) $day->closed_late,
            // Still open from an earlier date: nobody closed it. A manager can.
            'overdue_close' => $day->status === SiteDay::STATUS_OPEN && $day->date->toDateString() < LocalTime::dateOf(),
            'closed_by' => $name($day->closedBy),
            'till_count' => $day->till_count !== null ? (float) $day->till_count : null,
            // A closed day's cash as it was frozen at closing; for managers, an open day's cash so far.
            'cash' => match (true) {
                $day->status === SiteDay::STATUS_CLOSED && $day->cash_collected !== null => [
                    'final' => true,
                    'collected' => (float) $day->cash_collected,
                    'unconfirmed' => (float) $day->cash_unconfirmed,
                    'handed_over' => (float) $day->cash_handed_over,
                    'paid_out' => (float) ($day->cash_paid_out ?? 0),
                    'expected' => (float) $day->cash_expected,
                    'counted' => $day->till_count !== null ? (float) $day->till_count : null,
                    'difference' => $day->till_difference !== null ? (float) $day->till_difference : null,
                    'why' => $day->till_difference_note,
                ],
                $day->status === SiteDay::STATUS_OPEN && $manages => $this->cashSoFar($site, $day),
                default => null,
            },
            'close_note' => $day->close_note,
            'open_checklist' => $day->open_checklist ?? [],
            'close_checklist' => $day->close_checklist ?? [],
            'opening_items' => $settings->openingItems(),
            'closing_items' => $settings->closingItems(),
            'key_holder' => $key?->holder ? ['id' => (int) $key->holder->id, 'name' => $name($key->holder)] : null,
            'i_hold_key' => $key !== null && (int) $key->holder_id === (int) $viewer->id,
            'manages' => $manages,
        ];
    }

    /** @return array<string, mixed> */
    private function cashSoFar(StockLocation $site, SiteDay $day): array
    {
        $cash = app(DayCash::class)->figures($site, $day, now());

        return [
            'final' => false,
            'collected' => $cash['collected'],
            'unconfirmed' => $cash['unconfirmed'],
            'handed_over' => $cash['handed_over'],
            'paid_out' => $cash['paid_out'],
            'expected' => $cash['expected'],
            'counted' => null,
            'difference' => null,
            'why' => null,
        ];
    }

    /** @throws WorkforceException */
    private function atCounter(StockLocation $site, ?string $token): string
    {
        $kind = $this->qr->verify($site, $token);

        if ($kind === null) {
            throw new WorkforceException('Scan the QR at the counter. That code is not this site’s, or it has expired.');
        }

        return $kind;
    }

    /**
     * @param  array<int, string>  $items
     * @param  array<int, string>  $ticked
     * @return array<int, array{item: string, done: bool}>
     */
    private function ticks(array $items, array $ticked): array
    {
        return array_map(fn (string $item): array => ['item' => $item, 'done' => in_array($item, $ticked, true)], $items);
    }
}
