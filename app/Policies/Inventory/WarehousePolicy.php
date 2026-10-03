<?php

declare(strict_types=1);

namespace App\Policies\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\Warehouse;

/**
 * Who may oversee a warehouse.
 *
 * The rule the business asked for: a warehouse's operations belong to the one
 * or two users assigned to it, and nobody else bar an admin. Before this,
 * `warehouses.manager` was a typed-in name, so every warehouse screen was open
 * to any authenticated user who reached the URL.
 *
 * `oversee` is the ability every warehouse operation funnels through —
 * approving a replenishment into it, editing its capacity bands, picking from
 * it. `assignManagers` is deliberately narrower: a manager cannot appoint their
 * own successor or add a second pair of hands without an admin.
 */
class WarehousePolicy
{
    /** Admins see the whole network; everyone else sees what they manage. */
    public function viewAny(User $user): bool
    {
        return $user->isRole('admin')
            || $user->can('oversee warehouse')
            || $user->managedFacilityCount() > 0;
    }

    public function view(User $user, Warehouse $warehouse): bool
    {
        return $this->oversee($user, $warehouse);
    }

    /**
     * The gate for day-to-day warehouse work.
     */
    public function oversee(User $user, Warehouse $warehouse): bool
    {
        if ($user->isRole('admin')) {
            return true;
        }

        return $warehouse->isManagedBy($user);
    }

    public function update(User $user, Warehouse $warehouse): bool
    {
        return $this->oversee($user, $warehouse);
    }

    public function create(User $user): bool
    {
        return $user->isRole('admin');
    }

    public function delete(User $user, Warehouse $warehouse): bool
    {
        return $user->isRole('admin');
    }

    /**
     * Appointing managers is an admin act.
     *
     * A facility may hold at most two assignments; the ceiling itself is
     * enforced in App\Models\Concerns\HasFacilityManagers::syncManagers().
     */
    public function assignManagers(User $user, Warehouse $warehouse): bool
    {
        return $user->isRole('admin');
    }
}
