<?php

declare(strict_types=1);

namespace App\Policies\Store;

use App\Models\Auth\User;
use App\Models\Store\Store;

/**
 * Who may oversee a facility.
 *
 * A facility is a `stores` row, which is a retail outlet, a remote warehouse or
 * a main warehouse depending on `stores.type`. The distinction matters for
 * authorization:
 *
 *   warehouse-type  only the assigned managers (or an admin) may oversee it,
 *                   the same rule WarehousePolicy applies to `warehouses` rows.
 *   retail          the staff posted there — a user whose `store_id` matches —
 *                   plus any assigned manager.
 */
class StorePolicy
{
    public function view(User $user, Store $store): bool
    {
        return $this->oversee($user, $store);
    }

    public function oversee(User $user, Store $store): bool
    {
        if ($user->isRole('admin')) {
            return true;
        }

        if ($store->isManagedBy($user)) {
            return true;
        }

        // A warehouse has no "posted staff" fallback: unassigned means
        // admin-only, not everyone.
        if ($store->isWarehouse()) {
            return false;
        }

        return $user->store_id !== null && (int) $user->store_id === (int) $store->id;
    }

    public function update(User $user, Store $store): bool
    {
        return $this->oversee($user, $store);
    }

    public function assignManagers(User $user, Store $store): bool
    {
        return $user->isRole('admin');
    }

    /**
     * Setting capacity bands for this facility's locations.
     *
     * A band drives automated replenishment, so it is a managerial decision
     * rather than a floor one.
     */
    public function manageCapacity(User $user, Store $store): bool
    {
        return $this->oversee($user, $store) && $user->canApproveReplenishment();
    }
}
