<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use App\Models\Auth\User;
use App\Models\Inventory\FacilityManager;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * A facility that one or two named users oversee.
 *
 * Mixed into both Warehouse and Store, because a warehouse exists as either in
 * this schema. Everything that authorizes warehouse work — the policies, the
 * replenishment approval gate — asks isManagedBy() and nothing else, so the
 * two representations behave identically.
 *
 * @property-read Collection<int, FacilityManager> $managerAssignments
 */
trait HasFacilityManagers
{
    public function managerAssignments(): MorphMany
    {
        return $this->morphMany(FacilityManager::class, 'facility');
    }

    /** The users overseeing this facility, primary first. */
    public function managers(): \Illuminate\Database\Eloquent\Relations\MorphToMany
    {
        return $this->morphToMany(User::class, 'facility', 'facility_managers')
            ->withPivot(['is_primary', 'assigned_by'])
            ->withTimestamps()
            ->orderByDesc('facility_managers.is_primary');
    }

    /**
     * Replace the manager set.
     *
     * The first id becomes the primary. Passing an empty array leaves the
     * facility unmanaged, which is a legitimate state — a facility nobody has
     * been assigned to yet is overseen by admins only, not by everybody.
     *
     * @param  array<int, int>  $userIds  at most FacilityManager::MAX_PER_FACILITY, primary first
     *
     * @throws InvalidArgumentException when more managers than the ceiling are given
     */
    public function syncManagers(array $userIds, ?int $assignedBy = null): void
    {
        // Duplicates would otherwise consume both slots with one person.
        $userIds = array_values(array_unique(array_map('intval', $userIds)));

        if (count($userIds) > FacilityManager::MAX_PER_FACILITY) {
            throw new InvalidArgumentException(sprintf(
                'A facility may have at most %d managers, %d given.',
                FacilityManager::MAX_PER_FACILITY,
                count($userIds),
            ));
        }

        DB::transaction(function () use ($userIds, $assignedBy): void {
            $this->managerAssignments()->whereNotIn('user_id', $userIds ?: [0])->delete();

            foreach ($userIds as $position => $userId) {
                $this->managerAssignments()->updateOrCreate(
                    ['user_id' => $userId],
                    ['is_primary' => $position === 0, 'assigned_by' => $assignedBy],
                );
            }
        });

        $this->unsetRelation('managerAssignments')->unsetRelation('managers');
    }

    /**
     * Is this user one of the facility's managers?
     *
     * Reads the loaded relation when there is one, so a list that eager-loaded
     * `managerAssignments` costs no extra query per row.
     */
    public function isManagedBy(?User $user): bool
    {
        if ($user === null) {
            return false;
        }

        if ($this->relationLoaded('managerAssignments')) {
            return $this->managerAssignments
                ->contains(fn (FacilityManager $assignment): bool => $assignment->user_id === $user->id);
        }

        return $this->managerAssignments()->where('user_id', $user->id)->exists();
    }

    public function primaryManager(): ?User
    {
        $assignment = $this->relationLoaded('managerAssignments')
            ? $this->managerAssignments->firstWhere('is_primary', true)
            : $this->managerAssignments()->where('is_primary', true)->first();

        return $assignment?->user;
    }
}
