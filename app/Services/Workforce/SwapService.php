<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Workforce\Shift;
use App\Models\Workforce\ShiftSwap;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Giving a shift to a colleague.
 *
 *   offer    the shift's person offers it to a colleague at the same site.
 *   take     the colleague agrees (or declines).
 *   approve  a manager of the site agrees: the shift is the colleague's,
 *            accepted, and the opening / closing duty moves with it. A
 *            manager never approves a swap they are part of.
 *   reject   the manager says no; the shift stays.
 *   cancel   the person who offered it, until it is approved.
 *
 * Editing or cancelling the shift drops its open swap (RotaService).
 */
class SwapService
{
    public function __construct(private readonly Sites $sites, private readonly RotaService $rota)
    {
    }

    /** @throws WorkforceException */
    public function offer(Shift $shift, User $from, User $to, ?string $note = null): ShiftSwap
    {
        return DB::transaction(function () use ($shift, $from, $to, $note): ShiftSwap {
            $shift = Shift::query()->with('site')->lockForUpdate()->findOrFail($shift->id);

            if ((int) $shift->user_id !== (int) $from->id) {
                throw new WorkforceException('You can only offer your own shift.', 403);
            }

            if (! in_array($shift->status, [Shift::STATUS_PUBLISHED, Shift::STATUS_ACCEPTED], true)) {
                throw new WorkforceException('Only a shift you were sent can be offered.');
            }

            if ($shift->starts_at->isPast()) {
                throw new WorkforceException('This shift has started.');
            }

            if ((int) $to->id === (int) $from->id || $shift->site === null || ! $this->sites->worksAt($to, $shift->site)) {
                throw new WorkforceException(sprintf('%s does not work at %s.', $to->first_name, $shift->site?->name ?? 'this site'));
            }

            if (ShiftSwap::query()->where('shift_id', $shift->id)->whereIn('status', ShiftSwap::OPEN)->exists()) {
                throw new WorkforceException('This shift is already offered. Cancel that first.');
            }

            $this->rota->assertFree($to, CarbonImmutable::parse($shift->starts_at), CarbonImmutable::parse($shift->ends_at), $shift);

            return ShiftSwap::create([
                'shift_id' => $shift->id,
                'from_id' => $from->id,
                'to_id' => $to->id,
                'status' => ShiftSwap::STATUS_OFFERED,
                'note' => $note !== null && trim($note) !== '' ? trim($note) : null,
            ]);
        });
    }

    /** @throws WorkforceException */
    public function take(ShiftSwap $swap, User $by): ShiftSwap
    {
        return DB::transaction(function () use ($swap, $by): ShiftSwap {
            $swap = $this->locked($swap, [ShiftSwap::STATUS_OFFERED]);
            $this->mustBe($by, (int) $swap->to_id, 'Only the colleague it was offered to can take it.');
            $this->rota->assertFree($by, CarbonImmutable::parse($swap->shift->starts_at), CarbonImmutable::parse($swap->shift->ends_at), $swap->shift);

            $swap->update(['status' => ShiftSwap::STATUS_TAKEN, 'taken_at' => now()]);

            return $swap;
        });
    }

    /** @throws WorkforceException */
    public function decline(ShiftSwap $swap, User $by, ?string $note = null): ShiftSwap
    {
        return DB::transaction(function () use ($swap, $by, $note): ShiftSwap {
            $swap = $this->locked($swap, [ShiftSwap::STATUS_OFFERED]);
            $this->mustBe($by, (int) $swap->to_id, 'Only the colleague it was offered to can decline it.');

            $swap->update(['status' => ShiftSwap::STATUS_DECLINED, 'decided_at' => now(), 'decision_note' => $note ?: null]);

            return $swap;
        });
    }

    /** @throws WorkforceException */
    public function approve(ShiftSwap $swap, User $manager): ShiftSwap
    {
        return DB::transaction(function () use ($swap, $manager): ShiftSwap {
            $swap = $this->locked($swap, [ShiftSwap::STATUS_TAKEN]);
            $this->mayDecide($swap, $manager);

            $this->rota->reassign($swap->shift, $swap->to);
            $swap->update(['status' => ShiftSwap::STATUS_APPROVED, 'decided_by' => $manager->id, 'decided_at' => now()]);

            return $swap;
        });
    }

    /** @throws WorkforceException */
    public function reject(ShiftSwap $swap, User $manager, ?string $note = null): ShiftSwap
    {
        return DB::transaction(function () use ($swap, $manager, $note): ShiftSwap {
            $swap = $this->locked($swap, ShiftSwap::OPEN);
            $this->mayDecide($swap, $manager);

            $swap->update(['status' => ShiftSwap::STATUS_REJECTED, 'decided_by' => $manager->id, 'decided_at' => now(), 'decision_note' => $note ?: null]);

            return $swap;
        });
    }

    /** @throws WorkforceException */
    public function cancel(ShiftSwap $swap, User $by): ShiftSwap
    {
        return DB::transaction(function () use ($swap, $by): ShiftSwap {
            $swap = $this->locked($swap, ShiftSwap::OPEN);
            $this->mustBe($by, (int) $swap->from_id, 'Only the person who offered it can take it back.');

            $swap->update(['status' => ShiftSwap::STATUS_CANCELLED, 'decided_at' => now()]);

            return $swap;
        });
    }

    /**
     * Shifts offered to this person.
     *
     * @return Collection<int, ShiftSwap>
     */
    public function offersFor(User $user): Collection
    {
        return ShiftSwap::query()->with(['shift.site', 'from'])
            ->where('to_id', $user->id)
            ->where('status', ShiftSwap::STATUS_OFFERED)
            ->oldest('id')
            ->get();
    }

    /**
     * This person's open offers (waiting on the colleague or the manager).
     *
     * @return Collection<int, ShiftSwap>
     */
    public function openFrom(User $user): Collection
    {
        return ShiftSwap::query()->with(['shift.site', 'to'])
            ->where('from_id', $user->id)
            ->whereIn('status', ShiftSwap::OPEN)
            ->oldest('id')
            ->get();
    }

    /**
     * Swaps both people agreed to, waiting on this manager.
     *
     * @return Collection<int, ShiftSwap>
     */
    public function awaiting(User $manager): Collection
    {
        return ShiftSwap::query()->with(['shift.site', 'from', 'to'])
            ->where('status', ShiftSwap::STATUS_TAKEN)
            ->where('from_id', '!=', $manager->id)
            ->where('to_id', '!=', $manager->id)
            ->oldest('id')
            ->get()
            ->filter(fn (ShiftSwap $swap): bool => $swap->shift?->site !== null && $this->sites->canManage($manager, $swap->shift->site))
            ->values();
    }

    /** @return array<string, mixed> */
    public function present(ShiftSwap $swap): array
    {
        $swap->loadMissing(['shift.site', 'from', 'to']);
        $name = fn (?User $user): ?string => $user ? trim($user->first_name.' '.$user->last_name) : null;

        return [
            'id' => (int) $swap->id,
            'status' => $swap->status,
            'note' => $swap->note,
            'decision_note' => $swap->decision_note,
            'from' => $swap->from ? ['id' => (int) $swap->from->id, 'name' => $name($swap->from)] : null,
            'to' => $swap->to ? ['id' => (int) $swap->to->id, 'name' => $name($swap->to)] : null,
            'shift' => $swap->shift ? $this->rota->present($swap->shift) : null,
        ];
    }

    /**
     * @param  array<int, string>  $statuses
     *
     * @throws WorkforceException
     */
    private function locked(ShiftSwap $swap, array $statuses): ShiftSwap
    {
        $swap = ShiftSwap::query()->with(['shift.site', 'from', 'to'])->lockForUpdate()->findOrFail($swap->id);

        if (! in_array($swap->status, $statuses, true)) {
            throw new WorkforceException('This swap is no longer waiting for that.');
        }

        return $swap;
    }

    /** @throws WorkforceException */
    private function mayDecide(ShiftSwap $swap, User $manager): void
    {
        if (in_array((int) $manager->id, [(int) $swap->from_id, (int) $swap->to_id], true)) {
            throw new WorkforceException('Another manager decides on a swap you are part of.', 403);
        }

        if ($swap->shift?->site === null || ! $this->sites->canManage($manager, $swap->shift->site)) {
            throw new WorkforceException('Only a manager of this site decides on the swap.', 403);
        }
    }

    /** @throws WorkforceException */
    private function mustBe(User $by, int $userId, string $message): void
    {
        if ((int) $by->id !== $userId) {
            throw new WorkforceException($message, 403);
        }
    }
}
