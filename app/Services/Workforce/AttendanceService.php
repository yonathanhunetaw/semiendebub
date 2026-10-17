<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\Shift;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\TimeEntry;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Clocking in and out.
 *
 *   clockIn   at the counter, with the live code (the counter screen), once
 *             the site is open. The opener is clocked in by opening it.
 *   clockOut  the same, with the live code. Closing the site clocks out the
 *             closer, and whoever they clock out with it.
 *   manager   a manager clocks someone in or out, or fixes a row, with a note.
 *   autoClose the sweep closes clock-ins nobody closed (two hours after the
 *             site's closing time, or after 16 hours) and flags them.
 *
 * A row is linked to the shift it covers and flagged late, early_leave or
 * unscheduled against it. One open row per person at a time.
 */
class AttendanceService
{
    /** Minutes either side of a shift's times before late / early counts. */
    public const GRACE_MINUTES = 5;

    /** How long after the site's closing time an open clock-in is closed. */
    public const AUTO_CLOSE_AFTER_HOURS = 2;

    public const MAX_HOURS = 16;

    public function __construct(private readonly Sites $sites, private readonly CounterQr $qr)
    {
    }

    /** @throws WorkforceException */
    public function clockIn(User $user, StockLocation $site, ?string $token): TimeEntry
    {
        $kind = $this->qr->verify($site, $token);

        if ($kind === null) {
            throw new WorkforceException('Scan the code on the counter screen. That code is not this site’s, or it has expired.');
        }

        if ($kind === CounterQr::KIND_PRINTED) {
            throw new WorkforceException('The printed QR only opens the site. Clock in with the code on the counter screen.');
        }

        return $this->start($user, $site, TimeEntry::METHOD_QR, $user);
    }

    /** @throws WorkforceException */
    public function clockOut(User $user, StockLocation $site, ?string $token): TimeEntry
    {
        if ($this->qr->verify($site, $token) !== CounterQr::KIND_LIVE) {
            throw new WorkforceException('Clock out with the code on the counter screen. That code is not valid, or it has expired.');
        }

        return $this->finish($this->openEntryOrFail($user, $site), TimeEntry::METHOD_QR, $user);
    }

    /**
     * The opener, as they open the site (SiteDayService::open).
     */
    public function clockInOpener(User $user, StockLocation $site): ?TimeEntry
    {
        if (! $this->sites->hasShifts($site) || $this->openEntry($user) !== null) {
            return null;
        }

        return $this->start($user, $site, TimeEntry::METHOD_OPENING, $user, mustBeOpen: false);
    }

    /**
     * At closing: everyone still clocked in other than the closer. Closing is
     * refused while there are any, unless the closer clocks them out too.
     *
     * @return Collection<int, TimeEntry>
     */
    public function stillIn(StockLocation $site, ?User $except = null): Collection
    {
        return TimeEntry::query()->open()->with('user')
            ->where('stock_location_id', $site->id)
            ->when($except !== null, fn ($query) => $query->where('user_id', '!=', $except->id))
            ->get();
    }

    /** Closing the site: clock out the closer and (when asked) everyone else. */
    public function clockOutAtClosing(StockLocation $site, User $closer): void
    {
        foreach ($this->stillIn($site) as $entry) {
            $this->finish($entry, TimeEntry::METHOD_CLOSING, $closer, (int) $entry->user_id === (int) $closer->id ? null : 'Clocked out when '.$closer->first_name.' closed the site');
        }
    }

    /** @throws WorkforceException */
    public function managerClockIn(User $manager, User $user, StockLocation $site, ?CarbonInterface $at, string $note): TimeEntry
    {
        $this->mustManage($manager, $site);
        $this->needsNote($note);

        $entry = $this->start($user, $site, TimeEntry::METHOD_MANAGER, $manager, $at, mustBeOpen: false);
        $entry->update(['note' => trim($note)]);

        return $entry;
    }

    /** @throws WorkforceException */
    public function managerClockOut(User $manager, TimeEntry $entry, ?CarbonInterface $at, string $note): TimeEntry
    {
        $this->mustManage($manager, $entry->site);
        $this->needsNote($note);

        if ($entry->clock_out_at !== null) {
            throw new WorkforceException('Already clocked out. Fix the times instead.');
        }

        return $this->finish($entry, TimeEntry::METHOD_MANAGER, $manager, trim($note), $at);
    }

    /**
     * A manager corrects a row's times (an auto-closed one, say). The row is
     * flagged fixed and marked looked at.
     *
     * @throws WorkforceException
     */
    public function fix(User $manager, TimeEntry $entry, CarbonInterface $in, ?CarbonInterface $out, string $note): TimeEntry
    {
        $this->mustManage($manager, $entry->site);
        $this->needsNote($note);

        if ($out !== null && $out->lessThanOrEqualTo($in)) {
            throw new WorkforceException('Clock-out is after clock-in.');
        }

        if ($out !== null && $in->diffInMinutes($out) > self::MAX_HOURS * 60) {
            throw new WorkforceException(sprintf('One stretch is at most %d hours.', self::MAX_HOURS));
        }

        $entry->update([
            'clock_in_at' => $in,
            'clock_out_at' => $out,
            'out_method' => $out !== null ? ($entry->out_method ?? TimeEntry::METHOD_MANAGER) : null,
            'flags' => $this->flags($entry->shift, CarbonImmutable::instance($in), $out ? CarbonImmutable::instance($out) : null, [TimeEntry::FLAG_FIXED]),
            'note' => trim(($entry->note ? $entry->note.' · ' : '').trim($note)),
            'reviewed_at' => now(),
            'reviewed_by' => $manager->id,
        ]);

        return $entry;
    }

    /** A manager has seen a flagged row and it is right as it is. @throws WorkforceException */
    public function review(User $manager, TimeEntry $entry): TimeEntry
    {
        $this->mustManage($manager, $entry->site);
        $entry->update(['reviewed_at' => now(), 'reviewed_by' => $manager->id]);

        return $entry;
    }

    /** Close clock-ins nobody closed. Returns how many it closed. */
    public function autoClose(?CarbonInterface $now = null): int
    {
        $now = CarbonImmutable::parse(($now ?? now())->toDateTimeString());
        $closed = 0;

        foreach (TimeEntry::query()->open()->with(['site', 'shift'])->get() as $entry) {
            $site = $entry->site;
            $in = CarbonImmutable::instance($entry->clock_in_at);
            $closes = $site ? $this->sites->closesAt($site, $in) : null;
            $limit = $in->addHours(self::MAX_HOURS);
            $at = null;

            if ($closes !== null && $closes->greaterThan($in) && $now->greaterThanOrEqualTo($closes->addHours(self::AUTO_CLOSE_AFTER_HOURS))) {
                $at = $closes;
            } elseif ($now->greaterThanOrEqualTo($limit)) {
                $at = $entry->shift ? CarbonImmutable::instance($entry->shift->ends_at)->max($in)->min($limit) : $limit;
            }

            if ($at === null) {
                continue;
            }

            $entry->update([
                'clock_out_at' => $at,
                'out_method' => TimeEntry::METHOD_AUTO,
                'flags' => array_values(array_unique([...($entry->flags ?? []), TimeEntry::FLAG_AUTO_CLOSED])),
            ]);
            $closed++;
        }

        return $closed;
    }

    public function openEntry(User $user): ?TimeEntry
    {
        return TimeEntry::query()->open()->with('site')->where('user_id', $user->id)->latest('clock_in_at')->first();
    }

    /**
     * A site's rows between two moments, for the attendance page.
     *
     * @return Collection<int, TimeEntry>
     */
    public function between(StockLocation $site, CarbonInterface $from, CarbonInterface $to): Collection
    {
        return TimeEntry::query()->with(['user', 'shift'])
            ->where('stock_location_id', $site->id)
            ->where('clock_in_at', '>=', $from)
            ->where('clock_in_at', '<', $to)
            ->orderBy('clock_in_at')
            ->get();
    }

    /** @return array<string, mixed> */
    public function present(TimeEntry $entry): array
    {
        $entry->loadMissing(['user', 'shift', 'site']);

        return [
            'id' => (int) $entry->id,
            'user' => $entry->user ? ['id' => (int) $entry->user->id, 'name' => trim($entry->user->first_name.' '.$entry->user->last_name)] : null,
            'site' => $entry->site ? ['id' => (int) $entry->site->id, 'name' => $entry->site->name] : null,
            'clock_in_at' => $entry->clock_in_at->toIso8601String(),
            'clock_out_at' => $entry->clock_out_at?->toIso8601String(),
            'in_method' => $entry->in_method,
            'out_method' => $entry->out_method,
            'minutes' => $entry->minutes(),
            'flags' => $entry->flags ?? [],
            'note' => $entry->note,
            'reviewed' => $entry->reviewed_at !== null,
            'shift' => $entry->shift ? [
                'starts_at' => $entry->shift->starts_at->format('Y-m-d\TH:i'),
                'ends_at' => $entry->shift->ends_at->format('Y-m-d\TH:i'),
            ] : null,
        ];
    }

    /** @throws WorkforceException */
    private function start(User $user, StockLocation $site, string $method, User $by, ?CarbonInterface $at = null, bool $mustBeOpen = true): TimeEntry
    {
        if (! $this->sites->hasShifts($site)) {
            throw new WorkforceException(sprintf('%s has no clock-in (a Main Hub has a key and opening only).', $site->name));
        }

        if (! $this->sites->worksAt($user, $site)) {
            throw new WorkforceException(sprintf('%s does not work at this site.', $user->first_name), 403);
        }

        $at = CarbonImmutable::parse(($at ?? now())->toDateTimeString());

        if ($mustBeOpen) {
            $open = SiteDay::query()->where('stock_location_id', $site->id)->whereDate('date', $at->toDateString())->value('status') === SiteDay::STATUS_OPEN;
            if (! $open) {
                throw new WorkforceException(sprintf('%s is not open yet. Whoever holds the key opens it first.', $site->name));
            }
        }

        return DB::transaction(function () use ($user, $site, $method, $by, $at): TimeEntry {
            User::query()->whereKey($user->id)->lockForUpdate()->first();

            $already = $this->openEntry($user);
            if ($already !== null) {
                throw new WorkforceException(sprintf(
                    '%s is already clocked in at %s since %s.',
                    $user->first_name,
                    $already->site?->name ?? 'a site',
                    $already->clock_in_at->format('H:i'),
                ));
            }

            $shift = $this->shiftAt($user, $site, $at);

            return TimeEntry::create([
                'user_id' => $user->id,
                'stock_location_id' => $site->id,
                'shift_id' => $shift?->id,
                'clock_in_at' => $at,
                'in_method' => $method,
                'in_by' => $by->id,
                'flags' => $this->flags($shift, $at, null),
            ]);
        });
    }

    private function finish(TimeEntry $entry, string $method, User $by, ?string $note = null, ?CarbonInterface $at = null): TimeEntry
    {
        $at = CarbonImmutable::parse(($at ?? now())->toDateTimeString());
        $entry->loadMissing('shift');

        $entry->update([
            'clock_out_at' => $at,
            'out_method' => $method,
            'out_by' => $by->id,
            'flags' => $this->flags($entry->shift, CarbonImmutable::instance($entry->clock_in_at), $at, $entry->flags ?? []),
            'note' => $note !== null ? trim(($entry->note ? $entry->note.' · ' : '').$note) : $entry->note,
        ]);

        return $entry;
    }

    /** @throws WorkforceException */
    private function openEntryOrFail(User $user, StockLocation $site): TimeEntry
    {
        $entry = $this->openEntry($user);

        if ($entry === null || (int) $entry->stock_location_id !== (int) $site->id) {
            throw new WorkforceException(sprintf('You are not clocked in at %s.', $site->name));
        }

        return $entry;
    }

    /** The person's sent shift at this site around this moment (an hour early counts). */
    private function shiftAt(User $user, StockLocation $site, CarbonImmutable $at): ?Shift
    {
        return Shift::query()->sent()
            ->where('user_id', $user->id)
            ->where('stock_location_id', $site->id)
            ->where('starts_at', '<=', $at->addHour())
            ->where('ends_at', '>', $at)
            ->orderBy('starts_at')
            ->first();
    }

    /**
     * @param  array<int, string>  $keep  flags that are not about the times
     * @return array<int, string>
     */
    private function flags(?Shift $shift, CarbonImmutable $in, ?CarbonImmutable $out, array $keep = []): array
    {
        $flags = array_values(array_intersect($keep, [TimeEntry::FLAG_AUTO_CLOSED, TimeEntry::FLAG_FIXED]));

        if ($shift === null) {
            $flags[] = TimeEntry::FLAG_UNSCHEDULED;
        } else {
            if ($in->greaterThan(CarbonImmutable::instance($shift->starts_at)->addMinutes(self::GRACE_MINUTES))) {
                $flags[] = TimeEntry::FLAG_LATE;
            }

            if ($out !== null && $out->lessThan(CarbonImmutable::instance($shift->ends_at)->subMinutes(self::GRACE_MINUTES))) {
                $flags[] = TimeEntry::FLAG_EARLY_LEAVE;
            }
        }

        return array_values(array_unique($flags));
    }

    /** @throws WorkforceException */
    private function mustManage(User $manager, ?StockLocation $site): void
    {
        if ($site === null || ! $this->sites->canManage($manager, $site)) {
            throw new WorkforceException('Only a manager of this site can do that.', 403);
        }
    }

    /** @throws WorkforceException */
    private function needsNote(string $note): void
    {
        if (trim($note) === '') {
            throw new WorkforceException('Add a note saying why.');
        }
    }
}
