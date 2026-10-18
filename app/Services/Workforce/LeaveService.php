<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\LeaveRequest;
use App\Models\Workforce\Shift;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Days off.
 *
 *   request  the person asks for days off (annual, sick, unpaid, other).
 *   approve  a manager of a site they work at says yes — never their own
 *            leave. The person's shifts on those days are cancelled, so the
 *            rota shows the gap.
 *   reject   no, with a note.
 *   record   a manager enters leave that is already agreed (someone called
 *            in sick): approved at once, shifts cancelled.
 *   cancel   the person, while it is still waiting or has not started; or a
 *            manager. Cancelled shifts are not brought back.
 *
 * Nobody gets a shift on a day of approved leave (RotaService checks).
 */
class LeaveService
{
    public const MAX_DAYS = 60;

    public function __construct(private readonly Sites $sites, private readonly RotaService $rota)
    {
    }

    /** @throws WorkforceException */
    public function request(User $user, string $type, CarbonInterface $from, CarbonInterface $to, ?string $note = null): LeaveRequest
    {
        [$from, $to] = $this->range($from, $to);

        if ($from->toDateString() < LocalTime::dateOf() && $type !== 'sick') {
            throw new WorkforceException('Ask for leave from today on. Past days are entered by a manager.');
        }

        if ($this->approversFor($user)->isEmpty()) {
            throw new WorkforceException('Nobody manages a site you work at, so there is nobody to approve it.');
        }

        return DB::transaction(function () use ($user, $type, $from, $to, $note): LeaveRequest {
            $this->noOverlap($user, $from, $to);

            return LeaveRequest::create([
                'user_id' => $user->id,
                'type' => $this->type($type),
                'starts_on' => $from->toDateString(),
                'ends_on' => $to->toDateString(),
                'note' => $note !== null && trim($note) !== '' ? trim($note) : null,
                'status' => LeaveRequest::STATUS_REQUESTED,
                'created_by' => $user->id,
            ]);
        });
    }

    /**
     * @return array{leave: LeaveRequest, cancelled: int}
     *
     * @throws WorkforceException
     */
    public function record(User $manager, User $user, string $type, CarbonInterface $from, CarbonInterface $to, ?string $note = null): array
    {
        [$from, $to] = $this->range($from, $to);
        $this->mayDecide($manager, $user);

        return DB::transaction(function () use ($manager, $user, $type, $from, $to, $note): array {
            $this->noOverlap($user, $from, $to);

            $leave = LeaveRequest::create([
                'user_id' => $user->id,
                'type' => $this->type($type),
                'starts_on' => $from->toDateString(),
                'ends_on' => $to->toDateString(),
                'note' => $note !== null && trim($note) !== '' ? trim($note) : null,
                'status' => LeaveRequest::STATUS_APPROVED,
                'created_by' => $manager->id,
                'decided_by' => $manager->id,
                'decided_at' => now(),
            ]);

            return ['leave' => $leave, 'cancelled' => $this->clearShifts($leave)];
        });
    }

    /**
     * @return int how many shifts it cancelled
     *
     * @throws WorkforceException
     */
    public function approve(LeaveRequest $leave, User $manager, ?string $note = null): int
    {
        return DB::transaction(function () use ($leave, $manager, $note): int {
            $leave = $this->waiting($leave);
            $this->mayDecide($manager, $leave->user);

            $leave->update([
                'status' => LeaveRequest::STATUS_APPROVED,
                'decided_by' => $manager->id,
                'decided_at' => now(),
                'decision_note' => $note !== null && trim($note) !== '' ? trim($note) : null,
            ]);

            return $this->clearShifts($leave);
        });
    }

    /** @throws WorkforceException */
    public function reject(LeaveRequest $leave, User $manager, string $note): LeaveRequest
    {
        return DB::transaction(function () use ($leave, $manager, $note): LeaveRequest {
            $leave = $this->waiting($leave);
            $this->mayDecide($manager, $leave->user);

            if (trim($note) === '') {
                throw new WorkforceException('Say why, so they can ask for other days.');
            }

            $leave->update([
                'status' => LeaveRequest::STATUS_REJECTED,
                'decided_by' => $manager->id,
                'decided_at' => now(),
                'decision_note' => trim($note),
            ]);

            return $leave;
        });
    }

    /** @throws WorkforceException */
    public function cancel(LeaveRequest $leave, User $by): LeaveRequest
    {
        $own = (int) $leave->user_id === (int) $by->id;
        $manages = ! $own && $this->manages($by, $leave->user);

        if (! $own && ! $manages) {
            throw new WorkforceException('Only the person or their manager can cancel this leave.', 403);
        }

        if (! in_array($leave->status, [LeaveRequest::STATUS_REQUESTED, LeaveRequest::STATUS_APPROVED], true)) {
            throw new WorkforceException('This leave is already closed.');
        }

        if ($own && $leave->status === LeaveRequest::STATUS_APPROVED && $leave->starts_on->toDateString() <= LocalTime::dateOf()) {
            throw new WorkforceException('This leave has started. Ask your manager to change it.');
        }

        $leave->update(['status' => LeaveRequest::STATUS_CANCELLED]);

        return $leave;
    }

    /** Is this person on approved leave that day? */
    public function onLeave(int $userId, CarbonInterface $date): bool
    {
        return LeaveRequest::query()
            ->where('user_id', $userId)
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->overlapping(LocalTime::dateText($date), LocalTime::dateText($date))
            ->exists();
    }

    /**
     * Approved leave of the people at a site between two dates (the rota).
     *
     * @return Collection<int, LeaveRequest>
     */
    public function atSite(StockLocation $site, CarbonInterface $from, CarbonInterface $to): Collection
    {
        $ids = $this->sites->people($site)->pluck('id');

        return LeaveRequest::query()->with('user')
            ->whereIn('user_id', $ids)
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->overlapping(LocalTime::dateText($from), LocalTime::dateText($to))
            ->orderBy('starts_on')
            ->get();
    }

    /**
     * Requests this manager can decide on, oldest first.
     *
     * @return Collection<int, LeaveRequest>
     */
    public function awaiting(User $manager): Collection
    {
        return LeaveRequest::query()->with('user')
            ->where('status', LeaveRequest::STATUS_REQUESTED)
            ->where('user_id', '!=', $manager->id)
            ->oldest('starts_on')
            ->get()
            ->filter(fn (LeaveRequest $leave): bool => $leave->user !== null && $this->manages($manager, $leave->user))
            ->values();
    }

    /**
     * This person's leave from a month ago on.
     *
     * @return Collection<int, LeaveRequest>
     */
    public function mine(User $user): Collection
    {
        return LeaveRequest::query()
            ->where('user_id', $user->id)
            ->whereDate('ends_on', '>=', LocalTime::today()->subMonth()->toDateString())
            ->orderByDesc('starts_on')
            ->get();
    }

    /** @return array<string, mixed> */
    public function present(LeaveRequest $leave): array
    {
        $leave->loadMissing(['user', 'decider']);

        return [
            'id' => (int) $leave->id,
            'user' => $leave->user ? ['id' => (int) $leave->user->id, 'name' => trim($leave->user->first_name.' '.$leave->user->last_name)] : null,
            'type' => $leave->type,
            'starts_on' => $leave->starts_on->toDateString(),
            'ends_on' => $leave->ends_on->toDateString(),
            'days' => $leave->days(),
            'note' => $leave->note,
            'status' => $leave->status,
            'decided_by' => $leave->decider ? trim($leave->decider->first_name.' '.$leave->decider->last_name) : null,
            'decision_note' => $leave->decision_note,
        ];
    }

    /** Does this person manage a site the other works at? */
    public function manages(User $manager, ?User $user): bool
    {
        if ($user === null) {
            return false;
        }

        return $this->sites->isGlobalAdmin($manager)
            || $this->approversFor($user)->contains(fn (User $approver): bool => (int) $approver->id === (int) $manager->id);
    }

    /**
     * Who may approve this person's leave: managers of the sites they work
     * at, and the global admins (so a store manager's own leave has someone).
     *
     * @return \Illuminate\Support\Collection<int, User>
     */
    public function approversFor(User $user): \Illuminate\Support\Collection
    {
        return $this->sites->workedAtBy($user)
            ->filter(fn (StockLocation $site): bool => $this->sites->hasShifts($site))
            ->flatMap(fn (StockLocation $site) => $this->sites->people($site)->filter(fn (User $person): bool => $this->sites->canManage($person, $site)))
            ->merge(User::query()->with('roles')->whereNull('store_id')->whereHas('roles', fn ($role) => $role->where('name', 'admin'))->get())
            ->reject(fn (User $person): bool => (int) $person->id === (int) $user->id)
            ->unique('id')
            ->values()
            ->toBase();
    }

    /** Cancel the person's shifts on the leave's days. */
    private function clearShifts(LeaveRequest $leave): int
    {
        $shifts = Shift::query()->live()
            ->where('user_id', $leave->user_id)
            ->where('starts_at', '<', LocalTime::startOf($leave->ends_on->toDateString())->addDay())
            ->where('ends_at', '>', LocalTime::startOf($leave->starts_on->toDateString()))
            ->get();

        foreach ($shifts as $shift) {
            $this->rota->cancelForLeave($shift);
        }

        return $shifts->count();
    }

    /** @throws WorkforceException */
    private function mayDecide(User $manager, ?User $user): void
    {
        if ($user !== null && (int) $manager->id === (int) $user->id) {
            throw new WorkforceException('Someone else decides on your own leave.', 403);
        }

        if (! $this->manages($manager, $user)) {
            throw new WorkforceException('Only a manager of a site they work at decides on their leave.', 403);
        }
    }

    /** @throws WorkforceException */
    private function waiting(LeaveRequest $leave): LeaveRequest
    {
        $leave = LeaveRequest::query()->with('user')->lockForUpdate()->findOrFail($leave->id);

        if ($leave->status !== LeaveRequest::STATUS_REQUESTED) {
            throw new WorkforceException('This leave is not waiting for a decision.');
        }

        return $leave;
    }

    /** @throws WorkforceException */
    private function noOverlap(User $user, CarbonImmutable $from, CarbonImmutable $to): void
    {
        $clash = LeaveRequest::query()
            ->where('user_id', $user->id)
            ->whereIn('status', [LeaveRequest::STATUS_REQUESTED, LeaveRequest::STATUS_APPROVED])
            ->overlapping($from->toDateString(), $to->toDateString())
            ->exists();

        if ($clash) {
            throw new WorkforceException('There is already leave on some of those days.');
        }
    }

    /**
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     *
     * @throws WorkforceException
     */
    private function range(CarbonInterface $from, CarbonInterface $to): array
    {
        $from = CarbonImmutable::parse(LocalTime::dateText($from));
        $to = CarbonImmutable::parse(LocalTime::dateText($to));

        if ($to->lessThan($from)) {
            throw new WorkforceException('Leave ends on or after the day it starts.');
        }

        if ($from->diffInDays($to) + 1 > self::MAX_DAYS) {
            throw new WorkforceException(sprintf('Ask for at most %d days at a time.', self::MAX_DAYS));
        }

        return [$from, $to];
    }

    private function type(string $type): string
    {
        return in_array($type, LeaveRequest::TYPES, true) ? $type : 'other';
    }
}
