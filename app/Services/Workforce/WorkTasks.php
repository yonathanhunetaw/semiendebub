<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Models\Auth\User;
use App\Models\Finance\Expense;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\CustodyKey;
use App\Models\Workforce\KeyHandover;
use App\Models\Workforce\Shift;
use App\Models\Workforce\ShiftSwap;
use App\Models\Workforce\StaffRide;
use App\Models\Workforce\StaffRideRider;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\SiteDayAnswer;
use App\Models\Workforce\TimeEntry;
use App\Services\Finance\ExpenseService;
use Illuminate\Support\Facades\Route;

/**
 * The bell's work tasks (TaskInbox): keys to accept, sites to open or close,
 * shifts to accept, clock-outs nobody made. Live counts, like every bell task.
 */
class WorkTasks
{
    public function __construct(
        private readonly KeyCustodyService $keys,
        private readonly Sites $sites,
        private readonly SiteDayService $days,
        private readonly RotaService $rota,
        private readonly LeaveService $leave,
        private readonly SwapService $swaps,
        private readonly OvertimeService $overtime,
    ) {
    }

    /**
     * @return array<int, array{id: string, kind: string, title: string, detail: string, count: int, href: string|null, urgent: bool}>
     */
    public function for(User $user): array
    {
        $tasks = [];
        $href = $this->workUrl($user);

        $waiting = $this->keys->waitingFor($user);
        if ($waiting->isNotEmpty()) {
            $first = $waiting->first();
            $tasks[] = $this->task('accept-keys', 'key', 'Accept a key', sprintf(
                '%s handed you the %s%s. Accept it once it is in your hand.',
                trim(($first->from?->first_name ?? 'Someone').' '.($first->from?->last_name ?? '')),
                $first->key?->label() ?? 'key',
                $waiting->count() > 1 ? sprintf(' (+%d more)', $waiting->count() - 1) : '',
            ), $waiting->count(), $href, true);
        }

        // Shifts sent to me that I have not accepted.
        $toAccept = Shift::query()->where('user_id', $user->id)->where('status', Shift::STATUS_PUBLISHED)->where('ends_at', '>', now())->count();
        if ($toAccept > 0) {
            $tasks[] = $this->task('accept-shifts', 'shift', 'Accept your shifts', sprintf(
                '%d shift%s waiting for you to accept, or to ask for a change.',
                $toAccept, $toAccept === 1 ? '' : 's',
            ), $toAccept, $href, true);
        }

        // A colleague offered me their shift.
        $offers = ShiftSwap::query()->where('to_id', $user->id)->where('status', ShiftSwap::STATUS_OFFERED)->count();
        if ($offers > 0) {
            $tasks[] = $this->task('swap-offers', 'shift', 'A shift is offered to you', "{$offers} shift(s) a colleague would like you to take.", $offers, $href, true);
        }

        // My ride today.
        $ride = StaffRide::query()->with(['vehicle', 'driver'])
            ->whereIn('status', [StaffRide::STATUS_REQUESTED, StaffRide::STATUS_CLAIMED, StaffRide::STATUS_DEPARTED])
            ->whereBetween('departs_at', [LocalTime::today()->utc(), LocalTime::today()->addDay()->utc()])
            ->whereHas('riders', fn ($rider) => $rider->where('user_id', $user->id)->where('status', StaffRideRider::STATUS_RIDING))
            ->orderBy('departs_at')->first();
        if ($ride !== null) {
            $tasks[] = $this->task("ride-{$ride->id}", 'truck', 'Your ride today', sprintf(
                'Leaves at %s%s.',
                LocalTime::wall($ride->departs_at, 'H:i'),
                $ride->driver ? sprintf(' with %s in %s', $ride->driver->first_name, $ride->vehicle?->plate ?? 'a car') : ', no driver yet',
            ), 1, $this->workRoute($user, 'work.rides'));
        }

        // Drivers: rides nobody has taken in the next day (a driver takes them from any app).
        if ($user->is_driver) {
            $pool = StaffRide::query()->where('status', StaffRide::STATUS_REQUESTED)
                ->whereBetween('departs_at', [now()->subHours(3), now()->addDay()]);
            $count = (clone $pool)->count();
            if ($count > 0) {
                $soon = (clone $pool)->where('departs_at', '<', now()->addHour())->exists();
                $tasks[] = $this->task('rides-to-take', 'truck', 'Staff rides to take', "{$count} staff ride(s) waiting for a driver.", $count, $this->workRoute($user, 'work.rides'), $soon);
            }
        }

        // Managers: change requests, unaccepted shifts and coverage gaps in the next 7 days.
        $managed = $user->hasAnyRole(['admin', 'dev', 'store_manager']) || $user->facilityAssignments()->exists()
            ? $this->sites->managedBy($user)->filter(fn (StockLocation $site): bool => $this->sites->hasShifts($site))
            : collect();

        $ids = $managed->pluck('id');

        if ($ids->isNotEmpty()) {
            $soon = Shift::query()->whereIn('stock_location_id', $ids)->where('ends_at', '>', now())->where('starts_at', '<', now()->addDays(7));

            $changes = (clone $soon)->where('status', Shift::STATUS_CHANGE_REQUESTED)->count();
            if ($changes > 0) {
                $tasks[] = $this->task('shift-changes', 'shift', 'Shift change requests', "{$changes} shift(s) someone asked to change.", $changes, $this->sitesUrl($user), true);
            }

            $unaccepted = (clone $soon)->where('status', Shift::STATUS_PUBLISHED)->count();
            if ($unaccepted > 0) {
                $tasks[] = $this->task('unaccepted-shifts', 'shift', 'Shifts not accepted yet', "{$unaccepted} shift(s) in the next 7 days not accepted.", $unaccepted, $this->sitesUrl($user));
            }

            $leave = $this->leave->awaiting($user)->count();
            if ($leave > 0) {
                $tasks[] = $this->task('leave-requests', 'shift', 'Leave to decide', "{$leave} leave request(s) waiting for you.", $leave, $this->workRoute($user, 'work.team'), true);
            }

            $swaps = $this->swaps->awaiting($user)->count();
            if ($swaps > 0) {
                $tasks[] = $this->task('swap-approvals', 'shift', 'Shift swaps to approve', "{$swaps} swap(s) both people agreed to.", $swaps, $this->workRoute($user, 'work.team'), true);
            }

            if ($this->overtime->settings()->needs_approval) {
                $pending = collect($this->overtime->forSites($managed, LocalTime::today()->subDays(14), LocalTime::today()))
                    ->filter(fn (array $day): bool => $day['status'] === 'pending' && $this->overtime->mayDecide($user, (int) $day['user_id'], (string) $day['date']))
                    ->count();
                if ($pending > 0) {
                    $tasks[] = $this->task('overtime-to-approve', 'shift', 'Overtime to approve', "{$pending} day(s) of overtime in the last two weeks to approve or turn down.", $pending, $this->sitesUrl($user));
                }
            }

            $gaps = $managed->sum(fn (StockLocation $site): int => count($this->rota->coverage($site, now(), now()->addDays(6))));
            if ($gaps > 0) {
                $tasks[] = $this->task('coverage-gaps', 'warning', 'Short of staff', "{$gaps} stretch(es) in the next 7 days below the staffing rules.", $gaps, $this->sitesUrl($user));
            }
        }

        // Still clocked in well after the shift (or a long day without one).
        $open = TimeEntry::query()->open()->with(['site', 'shift'])->where('user_id', $user->id)->first();
        if ($open !== null) {
            $over = $open->shift !== null
                ? now()->greaterThan($open->shift->ends_at->copy()->addMinutes(30))
                : now()->greaterThan($open->clock_in_at->copy()->addHours(10));
            if ($over) {
                $tasks[] = $this->task('still-clocked-in', 'shift', 'Clock out', sprintf(
                    'You are still clocked in at %s since %s. Scan the counter screen to clock out.',
                    $open->site?->name ?? 'your site',
                    LocalTime::wall($open->clock_in_at, 'H:i'),
                ), 1, $href, true);
            }
        }

        if ($ids->isNotEmpty()) {
            $review = TimeEntry::query()->whereIn('stock_location_id', $ids)
                ->whereNull('reviewed_at')
                ->where('clock_in_at', '>', now()->subDays(14))
                ->whereJsonContains('flags', TimeEntry::FLAG_AUTO_CLOSED)
                ->count();
            if ($review > 0) {
                $tasks[] = $this->task('clock-review', 'shift', 'Clock-outs nobody made', "{$review} clock-in(s) the system closed. Check the times.", $review, $this->sitesUrl($user));
            }
        }

        // Finance and global admins: expenses (ride fuel…) someone else recorded.
        if (ExpenseService::mayConfirm($user)) {
            $claimed = Expense::query()->where('status', Expense::STATUS_CLAIMED)->where('recorded_by', '!=', $user->id)->count();
            if ($claimed > 0) {
                $app = $user->isRole('finance') ? 'finance' : 'admin';
                $tasks[] = $this->task('expenses-to-confirm', 'payment', 'Expenses to confirm', "{$claimed} expense(s) waiting for a second person.", $claimed,
                    Route::has("{$app}.expenses.index") ? route("{$app}.expenses.index") : null, true);
            }
        }

        // Read-only: the bell runs on every page, so it never creates site days.
        // Today's rows, and any day still open from an earlier date: a shop open
        // past midnight is still that day's, and its closer still has to close it.
        $today = SiteDay::query()->with('site')
            ->where(fn ($q) => $q->whereDate('date', LocalTime::dateOf())->orWhere('status', SiteDay::STATUS_OPEN))
            ->get();
        $forgotten = $today->where('status', SiteDay::STATUS_OPEN)
            ->filter(fn (SiteDay $day): bool => $day->date->toDateString() < LocalTime::dateOf());

        foreach ($today->where('opener_id', $user->id)->whereIn('status', [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED]) as $day) {
            $opens = $day->site ? $this->sites->opensAt($day->site, now()) : null;
            $tasks[] = $this->task("open-site-{$day->stock_location_id}", 'site', $day->status === SiteDay::STATUS_MISSED ? 'Open the site: late' : 'You open today', sprintf(
                '%s opens%s. Scan the QR at the counter to open it.',
                $day->site?->name ?? 'Your site',
                $opens ? ' at '.LocalTime::wall($opens, 'H:i') : '',
            ), 1, $href, $day->status === SiteDay::STATUS_MISSED);
        }

        foreach ($today->where('closer_id', $user->id)->where('status', SiteDay::STATUS_OPEN) as $day) {
            $closes = $day->site ? $this->sites->closesAt($day->site, $day->date) : null;
            // Shown from half an hour before closing time; a day open past midnight always shows.
            if ($closes !== null && ! $forgotten->contains($day) && now()->lessThan($closes->subMinutes(30))) {
                continue;
            }
            $tasks[] = $this->task("close-site-{$day->stock_location_id}", 'site', 'You close today', sprintf(
                '%s closes%s. Count the till and hand the key to the next opener.',
                $day->site?->name ?? 'Your site',
                $closes ? ' at '.LocalTime::wall($closes, 'H:i') : '',
            ), 1, $href);
        }

        // Managers: sites not opened on time.
        $missed = $today->where('status', SiteDay::STATUS_MISSED)
            ->filter(fn (SiteDay $day): bool => $day->site !== null && (int) $day->opener_id !== (int) $user->id && $this->sites->canManage($user, $day->site));
        if ($missed->isNotEmpty()) {
            $tasks[] = $this->task('sites-not-open', 'warning', 'Not open on time', sprintf(
                '%s %s not open yet.',
                $missed->map(fn (SiteDay $day): string => $day->site->name)->join(', ', ' and '),
                $missed->count() === 1 ? 'is' : 'are',
            ), $missed->count(), $this->sitesUrl($user), true);
        }

        // Managers: a day still open from an earlier date that nobody closed.
        // The next day cannot open until it is closed (a manager can set when it really closed).
        $unclosed = $forgotten->filter(fn (SiteDay $day): bool => $day->site !== null && $this->sites->canManage($user, $day->site));
        if ($unclosed->isNotEmpty()) {
            $tasks[] = $this->task('sites-not-closed', 'warning', 'A day nobody closed', sprintf(
                '%s %s still open from an earlier day. Close it with the real closing time and the till count.',
                $unclosed->map(fn (SiteDay $day): string => $day->site->name)->join(', ', ' and '),
                $unclosed->count() === 1 ? 'is' : 'are',
            ), $unclosed->count(), $this->sitesUrl($user), true);
        }

        // Managers: today's opening or closing with no driver (it goes ahead, but nobody brings or takes them).
        $driverless = $today->whereNull('driver_id')
            ->filter(fn (SiteDay $day): bool => $day->date->toDateString() === LocalTime::dateOf())
            ->whereIn('status', [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED, SiteDay::STATUS_OPEN])
            ->filter(fn (SiteDay $day): bool => $day->site !== null && $this->sites->canManage($user, $day->site));
        if ($driverless->isNotEmpty()) {
            $tasks[] = $this->task('sites-no-driver', 'warning', 'No driver today', sprintf(
                '%s %s no driver for opening and closing. Plan one on Shifts and opening.',
                $driverless->map(fn (SiteDay $day): string => $day->site->name)->join(', ', ' and '),
                $driverless->count() === 1 ? 'has' : 'have',
            ), $driverless->count(), $href);
        }

        // Drivers: today's runs from the plans, until they set off.
        if ($user->is_driver) {
            $runs = StaffRide::query()->with('site')->where('driver_id', $user->id)->whereNotNull('purpose')
                ->whereIn('status', [StaffRide::STATUS_REQUESTED, StaffRide::STATUS_CLAIMED])
                ->whereBetween('departs_at', [LocalTime::today()->utc(), LocalTime::today()->addDay()->utc()])
                ->orderBy('departs_at')->get();
            foreach ($runs as $run) {
                $tasks[] = $this->task("drive-{$run->id}", 'site', $run->purpose === StaffRide::PURPOSE_OPENING ? 'Bring the opener in' : 'Take the closer home', sprintf(
                    '%s at %s. Pick the car on Staff rides.',
                    $run->site?->name ?? 'The site',
                    LocalTime::wall($run->departs_at, 'H:i'),
                ), 1, $this->workRoute($user, 'work.rides'));
            }
        }

        array_push($tasks, ...$this->dutyAnswers($user, $href));

        // Site keys I hold whose next opener is someone else.
        $held = CustodyKey::query()->with('keyable')->where('holder_id', $user->id)->where('keyable_type', StockLocation::class)->get();
        foreach ($held as $key) {
            $site = $key->keyable;
            if (! $site instanceof StockLocation || $key->pendingHandover() !== null) {
                continue;
            }

            $now = $today->firstWhere('stock_location_id', $site->id);
            $opensToday = $now !== null && in_array($now->status, [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED], true);

            if ($now !== null && $now->status === SiteDay::STATUS_OPEN) {
                continue; // Open now: the key is needed at the site until closing.
            }

            // Whoever opens next: today, if it has not opened yet; else the next planned day.
            $next = $opensToday ? ($now->opener_id !== null ? $now->loadMissing('opener') : null) : $this->days->nextPlannedOpening($site, now());
            if ($opensToday && $now->opener_id === null) {
                continue; // Opens today with no opener named: the holder probably opens.
            }

            if ($next === null || $next->opener === null || (int) $next->opener_id === (int) $user->id) {
                continue;
            }

            $tasks[] = $this->task("pass-key-{$site->id}", 'key', 'Hand the key on', sprintf(
                '%s opens %s on %s. Hand them the %s.',
                $next->opener->first_name,
                $site->name,
                $next->date->format('D j M'),
                $key->label(),
            ), 1, $href);
        }

        return $tasks;
    }

    /** From this hour (shops' clock) the day before, an accepted job tomorrow is a reminder in the bell. */
    private const EVENING_HOUR = 17;

    /**
     * Saying yes or no to a duty, and what follows from it:
     *   - my jobs today and tomorrow I have not answered: confirm them;
     *   - from the evening before, tomorrow's jobs I said yes to (an opener is told where the key is);
     *   - managers: someone said they can't, in the week ahead: pick someone else.
     *
     * @return array<int, array{id: string, kind: string, title: string, detail: string, count: int, href: string|null, urgent: bool}>
     */
    private function dutyAnswers(User $user, ?string $href): array
    {
        $tasks = [];
        $today = LocalTime::dateOf();
        $tomorrow = LocalTime::day($today)->addDay()->toDateString();
        $evening = (int) LocalTime::wall(now(), 'H') >= self::EVENING_HOUR;
        $verb = ['opener' => 'open', 'closer' => 'close', 'driver' => 'drive for'];

        $mine = SiteDay::query()->with(['site', 'answers'])
            ->whereDate('date', '>=', $today)->whereDate('date', '<=', $tomorrow)
            ->whereIn('status', [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED, SiteDay::STATUS_OPEN])
            ->where(fn ($q) => $q->where('opener_id', $user->id)->orWhere('closer_id', $user->id)->orWhere('driver_id', $user->id))
            ->get();

        foreach ($mine as $day) {
            if ($day->site === null) {
                continue;
            }
            $isToday = $day->date->toDateString() === $today;
            $answers = $this->days->answersOf($day);

            foreach (SiteDayAnswer::DUTIES as $duty) {
                if ((int) $day->{$duty.'_id'} !== (int) $user->id || ($duty === 'opener' && $day->status === SiteDay::STATUS_OPEN)) {
                    continue;
                }
                $at = $duty === 'closer' ? $this->sites->closesAt($day->site, $day->date) : $this->sites->opensAt($day->site, $day->date);
                $when = ($isToday ? 'today' : 'tomorrow').($at ? ' at '.LocalTime::wall($at, 'H:i') : '');

                // Today's opener already has "You open today"; one task is enough.
                if ($answers[$duty] === null && ! ($isToday && $duty === 'opener')) {
                    $tasks[] = $this->task("answer-{$day->id}-{$duty}", 'shift', $isToday ? "Will you {$verb[$duty]} today?" : 'Confirm tomorrow’s job', sprintf(
                        'You %s %s %s. Say yes in My work, or tell the manager you can’t.',
                        $verb[$duty], $day->site->name, $when,
                    ), 1, $href, $isToday);

                    continue;
                }

                if ($answers[$duty] === null) {
                    continue;
                }

                if (! $isToday && $evening && $answers[$duty]['answer'] === SiteDayAnswer::YES) {
                    $tasks[] = $this->task("tomorrow-{$day->id}-{$duty}", 'site', 'Tomorrow', sprintf(
                        'You %s %s %s.%s',
                        $verb[$duty], $day->site->name, $when,
                        $duty === 'opener' ? $this->keyHint($day->site, $user) : '',
                    ), 1, $href);
                }
            }
        }

        // Managers: a "no" in the week ahead, from whoever still holds that duty.
        $noes = $this->days->cantDo($user);

        foreach ($noes as $answer) {
            $day = $answer->siteDay;
            $tasks[] = $this->task("cant-{$answer->id}", 'warning', 'Pick someone else', sprintf(
                '%s can’t %s %s on %s: “%s”.',
                $answer->user?->first_name ?? 'Someone',
                $verb[$answer->duty],
                $day->site->name,
                $day->date->format('D j M'),
                $answer->note,
            ), 1, $this->workRoute($user, 'work.rota', ['site' => $day->site->id, 'week' => $day->date->toDateString()]), true);
        }

        return $tasks;
    }

    /** For tomorrow's opener: where the site's key is, if not with them. */
    private function keyHint(StockLocation $site, User $user): string
    {
        $key = CustodyKey::query()->with('holder')->where('keyable_type', StockLocation::class)->where('keyable_id', $site->id)->first();

        return match (true) {
            $key === null || $key->holder === null => ' Nobody holds the key: ask a manager for it today.',
            (int) $key->holder_id === (int) $user->id => ' You have the key.',
            default => sprintf(' The key is with %s: get it from them today.', trim($key->holder->first_name.' '.$key->holder->last_name)),
        };
    }

    private function sitesUrl(User $user): ?string
    {
        return $this->workRoute($user, 'work.sites.index');
    }

    /** The user's own app's work page (absolute, so it works from any app). */
    public function workUrl(User $user): ?string
    {
        return $this->workRoute($user, 'work');
    }

    /** A work route in the user's own app, e.g. work.team. */
    private function workRoute(User $user, string $name, array $params = []): ?string
    {
        $app = match (true) {
            $user->isRole('seller', 'store_manager') => 'seller',
            $user->isRole('stock_keeper') => 'stock_keeper',
            $user->isRole('delivery') => 'delivery',
            $user->isRole('admin', 'dev') => 'admin',
            default => null,
        };

        return $app !== null && Route::has("{$app}.{$name}") ? route("{$app}.{$name}", $params) : null;
    }

    /** @return array{id: string, kind: string, title: string, detail: string, count: int, href: string|null, urgent: bool} */
    private function task(string $id, string $kind, string $title, string $detail, int $count, ?string $href, bool $urgent = false): array
    {
        return compact('id', 'kind', 'title', 'detail', 'count', 'href', 'urgent');
    }
}
