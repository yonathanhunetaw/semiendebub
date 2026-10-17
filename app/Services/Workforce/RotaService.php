<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\Shift;
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
 * A shift with the opening or closing duty names that person as the site
 * day's opener or closer (SiteDayService). One person never has two shifts
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

        $starts = CarbonImmutable::parse($data['starts_at']);
        $ends = CarbonImmutable::parse($data['ends_at']);
        $duty = in_array($data['duty'] ?? null, Shift::DUTIES, true) ? $data['duty'] : Shift::DUTY_NONE;

        if ($ends->lessThanOrEqualTo($starts)) {
            throw new WorkforceException('A shift ends after it starts.');
        }

        if ($starts->diffInMinutes($ends) > self::MAX_HOURS * 60) {
            throw new WorkforceException(sprintf('A shift is at most %d hours.', self::MAX_HOURS));
        }

        return DB::transaction(function () use ($site, $by, $person, $starts, $ends, $duty, $shift): Shift {
            User::query()->whereKey($person->id)->lockForUpdate()->first();

            $clash = Shift::query()->live()
                ->with('site')
                ->where('user_id', $person->id)
                ->when($shift !== null, fn ($query) => $query->whereKeyNot($shift->id))
                ->where('starts_at', '<', $ends)
                ->where('ends_at', '>', $starts)
                ->first();

            if ($clash !== null) {
                throw new WorkforceException(sprintf(
                    '%s already works %s–%s at %s then.',
                    $person->first_name,
                    $clash->starts_at->format('D H:i'),
                    $clash->ends_at->format('H:i'),
                    $clash->site?->name ?? 'another site',
                ));
            }

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
                $this->releaseDuty($site, $previous['duty'], (int) $previous['user_id'], CarbonImmutable::parse($previous['starts_at']));
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
                ->where('starts_at', '>=', CarbonImmutable::parse($from->toDateString())->startOfDay())
                ->where('starts_at', '<=', CarbonImmutable::parse($to->toDateString())->endOfDay())
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
            $this->releaseDuty($site, $shift->duty, (int) $shift->user_id, CarbonImmutable::parse($shift->starts_at));
        });

        return $shift;
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
        $from = CarbonImmutable::parse($weekStart->toDateString())->subWeek();
        $copied = 0;

        $shifts = Shift::query()->live()->where('stock_location_id', $site->id)
            ->whereBetween('starts_at', [$from, $from->addWeek()])->get();

        foreach ($shifts as $shift) {
            try {
                $this->save($site, $by, [
                    'user_id' => (int) $shift->user_id,
                    'starts_at' => $shift->starts_at->copy()->addWeek()->toDateTimeString(),
                    'ends_at' => $shift->ends_at->copy()->addWeek()->toDateTimeString(),
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

        $start = CarbonImmutable::parse($from->toDateString());
        $end = CarbonImmutable::parse($to->toDateString());

        $shifts = Shift::query()->live()->with('user.roles')
            ->where('stock_location_id', $site->id)
            ->where('starts_at', '<', $end->addDay())
            ->where('ends_at', '>', $start)
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

                $windowStart = CarbonImmutable::parse($date->toDateString().' '.$rule->starts_at);
                $windowEnd = CarbonImmutable::parse($date->toDateString().' '.$rule->ends_at);
                $matching = $shifts->filter(fn (Shift $shift): bool => $this->counts($shift, $rule->role)
                    && $shift->starts_at->lessThan($windowEnd) && $shift->ends_at->greaterThan($windowStart));

                foreach ($this->shortfalls($matching, $windowStart, $windowEnd, (int) $rule->min_people) as [$gapFrom, $gapTo, $have]) {
                    $gaps[] = [
                        'date' => $date->toDateString(),
                        'from' => $gapFrom->format('H:i'),
                        'to' => $gapTo->format('H:i'),
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
            ->where('starts_at', '>=', $from)
            ->where('starts_at', '<', $to)
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
            'date' => $shift->starts_at->toDateString(),
            // Wall-clock, no zone (like the shipment slots), so the browser does not shift it.
            'starts_at' => $shift->starts_at->format('Y-m-d\TH:i'),
            'ends_at' => $shift->ends_at->format('Y-m-d\TH:i'),
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
            $points->push(CarbonImmutable::parse($shift->starts_at)->max($from)->min($to));
            $points->push(CarbonImmutable::parse($shift->ends_at)->max($from)->min($to));
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

        $day = $this->days->day($site, CarbonImmutable::parse($shift->starts_at));
        $day->update([$shift->duty === Shift::DUTY_OPENER ? 'opener_id' : 'closer_id' => $shift->user_id]);
    }

    private function releaseDuty(StockLocation $site, ?string $duty, int $userId, CarbonImmutable $date): void
    {
        if ($duty === null || $duty === Shift::DUTY_NONE) {
            return;
        }

        $column = $duty === Shift::DUTY_OPENER ? 'opener_id' : 'closer_id';

        SiteDay::query()->where('stock_location_id', $site->id)
            ->whereDate('date', $date->toDateString())
            ->where($column, $userId)
            ->update([$column => null]);
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
