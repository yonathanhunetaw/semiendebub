<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\CustodyKey;
use App\Models\Workforce\KeyHandover;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Who holds a key, and handing it to the next person.
 *
 *   handOver  the holder says "I gave the key to you". It waits on the receiver.
 *   accept    the receiver has it: they are now the holder.
 *   reject    they do not have it: it stays with the giver.
 *   cancel    the giver (or a manager) takes the hand-over back.
 *   force     a manager gives the key to someone without the holder: a lost
 *             key, a holder who is away. Always logged, with a note.
 *
 * One key per site (a StockLocation node) and one per vehicle; no copies. The
 * holder changes only here.
 */
class KeyCustodyService
{
    public function __construct(private readonly Sites $sites)
    {
    }

    /** The key of a site or a vehicle, made on first use. */
    public function keyFor(Model $keyable): CustodyKey
    {
        if (! $keyable instanceof Vehicle && ! ($keyable instanceof StockLocation && $this->sites->isSite($keyable))) {
            throw new WorkforceException('Only a site or a vehicle has a key.');
        }

        return CustodyKey::query()->firstOrCreate([
            'keyable_type' => $keyable::class,
            'keyable_id' => $keyable->getKey(),
        ]);
    }

    /** May this person carry this key? */
    public function canHold(?User $user, CustodyKey $key): bool
    {
        if ($user === null) {
            return false;
        }

        $keyable = $key->keyable;

        if ($keyable instanceof Vehicle) {
            return (bool) $user->is_driver || $user->hasAnyRole(['admin', 'dev', 'store_manager']);
        }

        return $keyable instanceof StockLocation && $this->sites->worksAt($user, $keyable);
    }

    /** May this person force the key to someone, and see its whole log? */
    public function canManage(?User $user, CustodyKey $key): bool
    {
        if ($user === null) {
            return false;
        }

        $keyable = $key->keyable;

        if ($keyable instanceof Vehicle) {
            return $user->hasAnyRole(['admin', 'dev']);
        }

        return $keyable instanceof StockLocation && $this->sites->canManage($user, $keyable);
    }

    /** @throws WorkforceException */
    public function handOver(CustodyKey $key, User $by, User $to, ?string $reason = null, ?string $note = null): KeyHandover
    {
        return DB::transaction(function () use ($key, $by, $to, $reason, $note): KeyHandover {
            $key = CustodyKey::query()->lockForUpdate()->findOrFail($key->id);

            if ((int) $key->holder_id !== (int) $by->id) {
                throw new WorkforceException('You do not hold this key, so you cannot hand it over.', 403);
            }

            if ((int) $to->id === (int) $by->id) {
                throw new WorkforceException('You already hold this key.');
            }

            if (! $this->canHold($to, $key)) {
                throw new WorkforceException(sprintf('%s cannot hold the %s.', $this->name($to), $key->label()));
            }

            $pending = $key->pendingHandover();
            if ($pending !== null) {
                throw new WorkforceException(sprintf('This key is already waiting on %s to accept it. Cancel that first.', $this->name($pending->to)));
            }

            return KeyHandover::create([
                'custody_key_id' => $key->id,
                'from_id' => $by->id,
                'to_id' => $to->id,
                'status' => KeyHandover::STATUS_CLAIMED,
                'reason' => $this->reason($reason),
                'note' => $note,
                'created_by' => $by->id,
            ]);
        });
    }

    /** @throws WorkforceException */
    public function accept(KeyHandover $handover, User $by): KeyHandover
    {
        return DB::transaction(function () use ($handover, $by): KeyHandover {
            [$handover, $key] = $this->claimed($handover);

            if ((int) $handover->to_id !== (int) $by->id) {
                throw new WorkforceException('Only the person the key was handed to can accept it.', 403);
            }

            // The giver no longer holds it (a manager forced it elsewhere meanwhile).
            if ((int) $key->holder_id !== (int) $handover->from_id) {
                $handover->update(['status' => KeyHandover::STATUS_CANCELLED, 'decided_at' => now()]);

                throw new WorkforceException('The giver no longer holds this key, so this hand-over was cancelled.');
            }

            $key->update(['holder_id' => $by->id, 'held_since' => now()]);
            $handover->update(['status' => KeyHandover::STATUS_ACCEPTED, 'decided_at' => now()]);

            return $handover;
        });
    }

    /** @throws WorkforceException */
    public function reject(KeyHandover $handover, User $by, ?string $note = null): KeyHandover
    {
        return DB::transaction(function () use ($handover, $by, $note): KeyHandover {
            [$handover] = $this->claimed($handover);

            if ((int) $handover->to_id !== (int) $by->id) {
                throw new WorkforceException('Only the person the key was handed to can say they did not get it.', 403);
            }

            $handover->update([
                'status' => KeyHandover::STATUS_REJECTED,
                'decided_at' => now(),
                'note' => $note !== null && $note !== '' ? trim(($handover->note ? $handover->note.' · ' : '').'Not received: '.$note) : $handover->note,
            ]);

            return $handover;
        });
    }

    /** @throws WorkforceException */
    public function cancel(KeyHandover $handover, User $by): KeyHandover
    {
        return DB::transaction(function () use ($handover, $by): KeyHandover {
            [$handover, $key] = $this->claimed($handover);

            if ((int) $handover->from_id !== (int) $by->id && ! $this->canManage($by, $key)) {
                throw new WorkforceException('Only the giver or a manager can cancel this hand-over.', 403);
            }

            $handover->update(['status' => KeyHandover::STATUS_CANCELLED, 'decided_at' => now()]);

            return $handover;
        });
    }

    /** @throws WorkforceException */
    public function force(CustodyKey $key, User $by, User $to, string $note): KeyHandover
    {
        return DB::transaction(function () use ($key, $by, $to, $note): KeyHandover {
            $key = CustodyKey::query()->lockForUpdate()->findOrFail($key->id);

            if (! $this->canManage($by, $key)) {
                throw new WorkforceException('Only a manager of this site can give its key to someone directly.', 403);
            }

            if (trim($note) === '') {
                throw new WorkforceException('Say why the key is given without the holder (lost, away, first holder…).');
            }

            if (! $this->canHold($to, $key)) {
                throw new WorkforceException(sprintf('%s cannot hold the %s.', $this->name($to), $key->label()));
            }

            KeyHandover::query()->where('custody_key_id', $key->id)->where('status', KeyHandover::STATUS_CLAIMED)
                ->update(['status' => KeyHandover::STATUS_CANCELLED, 'decided_at' => now()]);

            $from = $key->holder_id;
            $key->update(['holder_id' => $to->id, 'held_since' => now()]);

            return KeyHandover::create([
                'custody_key_id' => $key->id,
                'from_id' => $from,
                'to_id' => $to->id,
                'status' => KeyHandover::STATUS_FORCED,
                'reason' => 'other',
                'note' => trim($note),
                'created_by' => $by->id,
                'decided_at' => now(),
            ]);
        });
    }

    /**
     * Keys this person holds now.
     *
     * @return Collection<int, CustodyKey>
     */
    public function heldBy(User $user): Collection
    {
        return CustodyKey::query()->with('keyable')->where('holder_id', $user->id)->get();
    }

    /**
     * Hand-overs waiting on this person to accept.
     *
     * @return Collection<int, KeyHandover>
     */
    public function waitingFor(User $user): Collection
    {
        return KeyHandover::query()->with(['key.keyable', 'from'])
            ->where('to_id', $user->id)
            ->where('status', KeyHandover::STATUS_CLAIMED)
            ->oldest('id')
            ->get();
    }

    /**
     * One key for a screen: who holds it, what is pending, what the viewer may
     * do, and (for managers) the recent log.
     *
     * @return array<string, mixed>
     */
    public function present(CustodyKey $key, User $viewer, bool $withLog = false): array
    {
        $key->loadMissing(['keyable', 'holder']);
        $pending = $key->pendingHandover()?->loadMissing(['from', 'to']);
        $manages = $this->canManage($viewer, $key);

        return [
            'id' => (int) $key->id,
            'label' => $key->label(),
            'kind' => $key->isVehicleKey() ? 'vehicle' : 'site',
            'holder' => $this->person($key->holder),
            'held_since' => $key->held_since?->toIso8601String(),
            'pending' => $pending === null ? null : $this->presentHandover($pending),
            'can' => [
                'hand_over' => (int) $key->holder_id === (int) $viewer->id && $pending === null,
                'force' => $manages,
                'cancel' => $pending !== null && ((int) $pending->from_id === (int) $viewer->id || $manages),
            ],
            'log' => $withLog || $manages
                ? $key->handovers()->with(['from', 'to', 'creator'])->limit(20)->get()
                    ->map(fn (KeyHandover $handover): array => $this->presentHandover($handover))->all()
                : [],
        ];
    }

    /** @return array<string, mixed> */
    public function presentHandover(KeyHandover $handover): array
    {
        return [
            'id' => (int) $handover->id,
            'status' => $handover->status,
            'reason' => $handover->reason,
            'note' => $handover->note,
            'from' => $this->person($handover->from),
            'to' => $this->person($handover->to),
            'by' => $this->person($handover->creator),
            'at' => $handover->created_at?->toIso8601String(),
            'decided_at' => $handover->decided_at?->toIso8601String(),
            'key_label' => $handover->relationLoaded('key') ? $handover->key?->label() : null,
        ];
    }

    /**
     * People who may receive this key, for the hand-over picker.
     *
     * @return array<int, array{id: int, name: string}>
     */
    public function receivers(CustodyKey $key, ?User $except = null): array
    {
        $keyable = $key->keyable;

        $people = $keyable instanceof StockLocation
            ? $this->sites->people($keyable)
            : User::query()->with('roles')->where(fn ($query) => $query
                ->where('is_driver', true)
                ->orWhereHas('roles', fn ($role) => $role->whereIn('name', ['admin', 'store_manager'])))
                ->orderBy('first_name')->get();

        return $people
            ->reject(fn (User $user): bool => $except !== null && (int) $user->id === (int) $except->id)
            ->map(fn (User $user): array => ['id' => (int) $user->id, 'name' => $this->name($user)])
            ->values()
            ->all();
    }

    /** @return array{0: KeyHandover, 1: CustodyKey} */
    private function claimed(KeyHandover $handover): array
    {
        $handover = KeyHandover::query()->lockForUpdate()->findOrFail($handover->id);
        $key = CustodyKey::query()->lockForUpdate()->findOrFail($handover->custody_key_id);

        if ($handover->status !== KeyHandover::STATUS_CLAIMED) {
            throw new WorkforceException('This hand-over is no longer waiting.');
        }

        return [$handover, $key];
    }

    private function reason(?string $reason): ?string
    {
        return in_array($reason, KeyHandover::REASONS, true) ? $reason : null;
    }

    /** @return array{id: int, name: string}|null */
    private function person(?User $user): ?array
    {
        return $user === null ? null : ['id' => (int) $user->id, 'name' => $this->name($user)];
    }

    private function name(?User $user): string
    {
        return $user === null ? 'Nobody' : trim($user->first_name.' '.$user->last_name);
    }
}
