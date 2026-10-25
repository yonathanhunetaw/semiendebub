<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\LeaveRequest;
use App\Models\Workforce\Shift;
use App\Models\Workforce\ShiftSwap;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\StaffingRule;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The rota: the manager assigns, the person accepts.
 *
 *   save           a manager drafts (or edits) a shift. Editing a shift the
 *                  person already saw sends it back to them to accept again.
 *   publish        drafts in a range go out; each person sees theirs.
 *   accept         the person will be there.
 *   requestChange  the person cannot, with a note; the manager edits or
 *                  cancels it.
 *   cancel         the manager drops a shift.
 *   coverage       where the shifts fall short of the site's staffing rules.
 *
 * Who opens, closes and drives is the site day's plan (SiteDayService::plan,
 * set on the Rota page). Older shifts may still carry an opening or closing
 * duty, which names that person in the plan. When a person's shift goes
 * (cancelled, leave, given away in a swap), the plan follows them. One person never has two shifts
 * at the same time, at any site. Stores and Remote Hubs only.
 */
class RotaService
{
    /** The longest one shift may be. */
    public const MAX_HOURS = 16;

    public function __construct(private readonly Sites $sites, private readonly SiteDayService $days)
    {
    }

    /**
     * @param  array{user_id: int, starts_at: string, ends_at: string, duty?: string|null}  $data
     *
     * @throws WorkforceException
     */
    public function save(StockLocation $site, User $by, array $data, ?Shift $shift = null): Shift
    {
        $this->mustManage($by, $site);

        if (! $this->sites->hasShifts($site)) {
            throw new WorkforceException(sprintf('%s has no shifts (a Main Hub has a key and opening only).', $site->name));
        }

        if ($shift !== null && (int) $shift->stock_location_id !== (int) $site->id) {
            throw new WorkforceException('That shift is at another site.', 404);
        }

        $person = User::query()->find((int) $data['user_id']);
        if ($person === null || ! $this->sites->worksAt($person, $site)) {
            throw new WorkforceException('That person does not work at this site.');
        }

        // Typed on the shops' clock; kept as UTC instants.
        $starts = LocalTime::parse((string) $data['starts_at']);
        $ends = LocalTime::parse((string) $data['ends_at']);
        // The Rota no longer sends a duty (the day's plan names opener and closer): keep whatever the shift had.
        $duty = in_array($data['duty'] ?? null, Shift::DUTIES, true) ? $data['duty'] : ($shift?->duty ?? Shift::DUTY_NONE);

        if ($ends->lessThanOrEqualTo($starts)) {
            throw new WorkforceException('A shift ends after it starts.');
        }

        if ($starts->diffInMinutes($ends) > self::MAX_HOURS * 60) {
            throw new WorkforceException(sprintf('A shift is at most %d hours.', self::MAX_HOURS));
        }

        return DB::transaction(function () use ($site, $by, $person, $starts, $ends, $duty, $shift): Shift {
            User::query()->whereKey($person->id)->lockForUpdate()->first();

            $this->assertFree($person, $starts, $ends, $shift);

            $previous = $shift?->only(['user_id', 'starts_at', 'duty']);
            $seen = $shift !== null && in_array($shift->status, [Shift::STATUS_PUBLISHED, Shift::STATUS_ACCEPTED, Shift::STATUS_CHANGE_REQUESTED], true);

            $attributes = [
                'stock_location_id' => $site->id,
                'user_id' => $person->id,
                'starts_at' => $starts,
                'ends_at' => $ends,
                'duty' => $duty,
            ];

            if ($shift === null) {
                $shift = Shift::create($attributes + ['status' => Shift::STATUS_DRAFT, 'created_by' => $by->id]);
            } else {
                // A shift the person saw goes back to them to accept again.
                $shift->update($attributes + ($seen ? [
                    'status' => Shift::STATUS_PUBLISHED,
                    'published_at' => now(),
                    'published_by' => $by->id,
                    'accepted_at' => null,
                    'change_note' => null,
                ] : []));
            }

            if ($previous !== null) {
                $this->dropSwaps($shift, 'The shift was changed');
                $this->releaseDuty($site, $previous['duty'], (int) $previous['user_id'], CarbonImmutable::instance($previous['starts_at']));
            }
            $this->applyDuty($site, $shift);

            return $shift;
        });
    }

    /**
     * Send the drafts between two dates. Returns how many went out.
     *
     * @throws WorkforceException
     */
    public function publish(StockLocation $site, User $by, CarbonInterface $from, CarbonInterface $to): int
    {
        $this->mustManage($by, $site);

        return DB::transaction(function () use ($site, $by, $from, $to): int {
            $drafts = Shift::query()
                ->where('stock_location_id', $site->id)
                ->where('status', Shift::STATUS_DRAFT)
                ->where('starts_at', '>=', LocalTime::startOf($from))
                ->where('starts_at', '<', LocalTime::startOf($to)->addDay())
                ->get();

            foreach ($drafts as $shift) {
                $shift->update(['status' => Shift::STATUS_PUBLISHED, 'published_at' => now(), 'published_by' => $by->id]);
                $this->applyDuty($site, $shift);
            }

            return $drafts->count();
        });
    }

    /** @throws WorkforceException */
    public function accept(Shift $shift, User $by): Shift
    {
        $this->mustBeTheirs($shift, $by);

        if (! in_array($shift->status, [Shift::STATUS_PUBLISHED, Shift::STATUS_CHANGE_REQUESTED], true)) {
            throw new WorkforceException('This shift is not waiting for you to accept it.');
        }

        $shift->update(['status' => Shift::STATUS_ACCEPTED, 'accepted_at' => now(), 'change_note' => null]);

        return $shift;
    }

    /** @throws WorkforceException */
    public function requestChange(Shift $shift, User $by, string $note): Shift
    {
        $this->mustBeTheirs($shift, $by);

        if (! in_array($shift->status, [Shift::STATUS_PUBLISHED, Shift::STATUS_ACCEPTED], true)) {
            throw new WorkforceException('You can ask to change a shift you were sent.');
        }

        if (trim($note) === '') {
            throw new WorkforceException('Say what does not work (the day, the time…).');
        }

        if ($shift->starts_at->isPast()) {
            throw new WorkforceException('This shift has started. Talk to your manager.');
        }

        $shift->update(['status' => Shift::STATUS_CHANGE_REQUESTED, 'change_note' => trim($note), 'accepted_at' => null]);

        return $shift;
    }

    /** @throws WorkforceException */
    public function cancel(Shift $shift, User $by): Shift
    {
        $site = $shift->site;
        $this->mustManage($by, $site);

        DB::transaction(function () use ($shift, $site): void {
            $shift->update(['status' => Shift::STATUS_CANCELLED]);
            $this->dropSwaps($shift, 'The shift was cancelled');
            $this->releaseDuty($site, $shift->duty, (int) $shift->user_id, CarbonImmutable::instance($shift->starts_at));
        });

        return $shift;
    }

    /** Approved leave cancels the person's shift (LeaveService); no manager check here. */
    public function cancelForLeave(Shift $shift): void
    {
        $shift->update(['status' => Shift::STATUS_CANCELLED, 'change_note' => 'On leave']);
        $this->dropSwaps($shift, 'On leave');

        if ($shift->site !== null) {
            $this->releaseDuty($shift->site, $shift->duty, (int) $shift->user_id, CarbonImmutable::instance($shift->starts_at));
        }
    }

    /**
     * Give a shift to someone else (an approved swap, SwapService): they have
     * already agreed, so it is accepted; the duty moves with it.
     *
     * @throws WorkforceException
     */
    public function reassign(Shift $shift, User $to): Shift
    {
        $site = $shift->site;
        $this->assertFree($to, CarbonImmutable::instance($shift->starts_at), CarbonImmutable::instance($shift->ends_at), $shift);

        $from = (int) $shift->user_id;
        $shift->update(['user_id' => $to->id, 'status' => Shift::STATUS_ACCEPTED, 'accepted_at' => now(), 'change_note' => null]);

        if ($site !== null) {
            $this->releaseDuty($site, $shift->duty, $from, CarbonImmutable::instance($shift->starts_at), $to);
            $this->applyDuty($site, $shift);
        }

        return $shift;
    }

    /**
     * Is this person free for that time: no other live shift, no approved leave?
     *
     * @throws WorkforceException
     */
    public function assertFree(User $person, CarbonImmutable $starts, CarbonImmutable $ends, ?Shift $except = null): void
    {
        $onLeave = LeaveRequest::query()
            ->where('user_id', $person->id)
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->overlapping(LocalTime::dateOf($starts), LocalTime::dateOf($ends))
            ->exists();

        if ($onLeave) {
            throw new WorkforceException(sprintf('%s is on leave that day.', $person->first_name));
        }

        $clash = Shift::query()->live()->with('site')
            ->where('user_id', $person->id)
            ->when($except !== null, fn ($query) => $query->whereKeyNot($except->id))
            ->where('starts_at', '<', $ends)
            ->where('ends_at', '>', $starts)
            ->first();

        if ($clash !== null) {
            throw new WorkforceException(sprintf(
                '%s already works %s–%s at %s then.',
                $person->first_name,
                LocalTime::wall($clash->starts_at, 'D H:i'),
                LocalTime::wall($clash->ends_at, 'H:i'),
                $clash->site?->name ?? 'another site',
            ));
        }
    }

    private function dropSwaps(Shift $shift, string $why): void
    {
        ShiftSwap::query()->where('shift_id', $shift->id)->whereIn('status', ShiftSwap::OPEN)
            ->update(['status' => ShiftSwap::STATUS_CANCELLED, 'decision_note' => $why, 'decided_at' => now(), 'updated_at' => now()]);
    }

    /**
     * Copy last week's live shifts a week on, as drafts, skipping clashes.
     * Returns how many it copied.
     *
     * @throws WorkforceException
     */
    public function copyWeek(StockLocation $site, User $by, CarbonInterface $weekStart): int
    {
        $this->mustManage($by, $site);
        $from = LocalTime::startOf($weekStart)->subWeek();
        $copied = 0;

        $shifts = Shift::query()->live()->where('stock_location_id', $site->id)
            ->whereBetween('starts_at', [$from, $from->addWeek()])->get();

        foreach ($shifts as $shift) {
            try {
                $this->save($site, $by, [
                    'user_id' => (int) $shift->user_id,
                    'starts_at' => LocalTime::wall($shift->starts_at->copy()->addWeek(), 'Y-m-d H:i'),
                    'ends_at' => LocalTime::wall($shift->ends_at->copy()->addWeek(), 'Y-m-d H:i'),
                    'duty' => $shift->duty,
                ]);
                $copied++;
            } catch (WorkforceException) {
                // A clash (or someone who left): skip that one.
            }
        }

        return $copied;
    }

    /**
     * Where the shifts fall short of the site's staffing rules, between two
     * dates. Drafts count: the gap shows while the manager plans.
     *
     * @return array<int, array{date: string, from: string, to: string, role: string, have: int, need: int}>
     */
    public function coverage(StockLocation $site, CarbonInterface $from, CarbonInterface $to): array
    {
        $rules = StaffingRule::query()->where('stock_location_id', $site->id)->get();
        if ($rules->isEmpty()) {
            return [];
        }

        $start = LocalTime::day($from);
        $end = LocalTime::day($to);

        $shifts = Shift::query()->live()->with('user.roles')
            ->where('stock_location_id', $site->id)
            ->where('starts_at', '<', $end->addDay()->utc())
            ->where('ends_at', '>', $start->utc())
            ->get();

        $gaps = [];
        for ($date = $start; $date->lessThanOrEqualTo($end); $date = $date->addDay()) {
            if ($this->sites->hoursOn($site, $date)['closed'] ?? false) {
                continue;
            }

            foreach ($rules as $rule) {
                if (! in_array($date->dayOfWeek, array_map('intval', $rule->weekdays ?? []), true)) {
                    continue;
                }

                $windowStart = LocalTime::at($date, (string) $rule->starts_at);
                $windowEnd = LocalTime::at($date, (string) $rule->ends_at);
                $matching = $shifts->filter(fn (Shift $shift): bool => $this->counts($shift, $rule->role)
                    && $shift->starts_at->lessThan($windowEnd) && $shift->ends_at->greaterThan($windowStart));

                foreach ($this->shortfalls($matching, $windowStart, $windowEnd, (int) $rule->min_people) as [$gapFrom, $gapTo, $have]) {
                    $gaps[] = [
                        'date' => $date->toDateString(),
                        'from' => LocalTime::wall($gapFrom, 'H:i'),
                        'to' => LocalTime::wall($gapTo, 'H:i'),
                        'role' => $rule->role,
                        'have' => $have,
                        'need' => (int) $rule->min_people,
                    ];
                }
            }
        }

        return $gaps;
    }

    /**
     * A site's shifts in a range, for the rota grid.
     *
     * @return Collection<int, Shift>
     */
    public function between(StockLocation $site, CarbonInterface $from, CarbonInterface $to): Collection
    {
        return Shift::query()->with('user')
            ->where('stock_location_id', $site->id)
            ->where('status', '!=', Shift::STATUS_CANCELLED)
            ->where('starts_at', '>=', CarbonImmutable::instance($from)->utc())
            ->where('starts_at', '<', CarbonImmutable::instance($to)->utc())
            ->orderBy('starts_at')
            ->get();
    }

    /**
     * This person's shifts from today on (sent ones only).
     *
     * @return Collection<int, Shift>
     */
    public function upcomingFor(User $user, int $days = 14): Collection
    {
        return Shift::query()->sent()->with('site')
            ->where('user_id', $user->id)
            ->where('ends_at', '>', now())
            ->where('starts_at', '<', now()->addDays($days))
            ->orderBy('starts_at')
            ->get();
    }

    /** @return array<string, mixed> */
    public function present(Shift $shift): array
    {
        $shift->loadMissing(['user', 'site']);

        return [
            'id' => (int) $shift->id,
            'site' => $shift->site ? ['id' => (int) $shift->site->id, 'name' => $shift->site->name] : null,
            'user' => $shift->user ? ['id' => (int) $shift->user->id, 'name' => trim($shift->user->first_name.' '.$shift->user->last_name)] : null,
            'date' => LocalTime::dateOf($shift->starts_at),
            // Wall-clock, no zone (like the shipment slots), so the browser does not shift it.
            'starts_at' => LocalTime::wall($shift->starts_at),
            'ends_at' => LocalTime::wall($shift->ends_at),
            'duty' => $shift->duty,
            'status' => $shift->status,
            'change_note' => $shift->change_note,
        ];
    }

    /** Does this shift's person count toward a rule's role? */
    public function counts(Shift $shift, string $role): bool
    {
        if ($role === StaffingRule::ROLE_ANY) {
            return true;
        }

        $user = $shift->user;

        return $user !== null && match ($role) {
            StaffingRule::ROLE_SELLER => $user->isRole('seller', 'store_manager'),
            StaffingRule::ROLE_STOCK_KEEPER => $user->isRole('stock_keeper'),
            default => false,
        };
    }

    /**
     * The stretches of a window where fewer than `need` shifts overlap.
     *
     * @param  \Illuminate\Support\Collection<int, Shift>  $shifts
     * @return array<int, array{0: CarbonImmutable, 1: CarbonImmutable, 2: int}>
     */
    private function shortfalls($shifts, CarbonImmutable $from, CarbonImmutable $to, int $need): array
    {
        $points = collect([$from, $to]);
        foreach ($shifts as $shift) {
            $points->push(CarbonImmutable::instance($shift->starts_at)->max($from)->min($to));
            $points->push(CarbonImmutable::instance($shift->ends_at)->max($from)->min($to));
        }

        $points = $points->unique(fn (CarbonImmutable $point): int => $point->getTimestamp())
            ->sortBy(fn (CarbonImmutable $point): int => $point->getTimestamp())
            ->values();

        $gaps = [];
        for ($i = 0; $i < $points->count() - 1; $i++) {
            [$a, $b] = [$points[$i], $points[$i + 1]];
            $have = $shifts->filter(fn (Shift $shift): bool => $shift->starts_at->lessThanOrEqualTo($a) && $shift->ends_at->greaterThanOrEqualTo($b))->count();

            if ($have >= $need) {
                continue;
            }

            $last = array_key_last($gaps);
            if ($last !== null && $gaps[$last][1]->equalTo($a) && $gaps[$last][2] === $have) {
                $gaps[$last][1] = $b;
            } else {
                $gaps[] = [$a, $b, $have];
            }
        }

        return $gaps;
    }

    /** A sent shift with a duty names its person on the site day; a draft does not yet. */
    private function applyDuty(StockLocation $site, Shift $shift): void
    {
        if ($shift->duty === Shift::DUTY_NONE || in_array($shift->status, [Shift::STATUS_DRAFT, Shift::STATUS_CANCELLED], true)) {
            return;
        }

        $day = $this->days->day($site, CarbonImmutable::instance($shift->starts_at));
        $day->update([$shift->duty === Shift::DUTY_OPENER ? 'opener_id' : 'closer_id' => $shift->user_id]);
        $this->days->planChanged($day);
    }

    /**
     * The person's shift left that day: their duty goes with it, and so do the
     * plan's opener / closer if they have no other shift there that day. With
     * $to (a swap), the plan names the colleague instead.
     */
    private function releaseDuty(StockLocation $site, ?string $duty, int $userId, CarbonImmutable $date, ?User $to = null): void
    {
        $day = SiteDay::query()->where('stock_location_id', $site->id)->whereDate('date', LocalTime::dateOf($date))->first();
        if ($day === null) {
            return;
        }

        $dayStart = LocalTime::startOf(LocalTime::dateOf($date));
        $stillThere = Shift::query()->where('stock_location_id', $site->id)->where('user_id', $userId)
            ->whereNotIn('status', [Shift::STATUS_CANCELLED])
            ->whereBetween('starts_at', [$dayStart, $dayStart->addDay()])
            ->exists();

        $columns = $stillThere ? [] : ['opener_id', 'closer_id'];
        if ($duty === Shift::DUTY_OPENER || $duty === Shift::DUTY_CLOSER) {
            $columns[] = $duty === Shift::DUTY_OPENER ? 'opener_id' : 'closer_id';
        }

        $changes = [];
        foreach (array_unique($columns) as $column) {
            if ((int) $day->{$column} === $userId) {
                $changes[$column] = $to?->id;
            }
        }

        if ($changes !== []) {
            $day->update($changes);
            $this->days->planChanged($day);
        }
    }

    /** @throws WorkforceException */
    private function mustManage(?User $by, ?StockLocation $site): void
    {
        if ($site === null || ! $this->sites->canManage($by, $site)) {
            throw new WorkforceException('Only a manager of this site makes its rota.', 403);
        }
    }

    /** @throws WorkforceException */
    private function mustBeTheirs(Shift $shift, User $by): void
    {
        if ((int) $shift->user_id !== (int) $by->id) {
            throw new WorkforceException('This is not your shift.', 403);
        }
    }
}
