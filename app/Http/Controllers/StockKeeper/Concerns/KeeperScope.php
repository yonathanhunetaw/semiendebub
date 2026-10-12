<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper\Concerns;

use App\Models\Auth\User;
use App\Models\Inventory\FacilityManager;
use App\Models\Inventory\StockLocation;
use App\Services\Inventory\StockKeeperVisibility;
use App\Services\Inventory\StockPermissions;

/**
 * The places a stock keeper works: the location ids their scope allows (null
 * = every dock), and whether they may act on one.
 */
trait KeeperScope
{
    /** @return array<int, int>|null */
    protected function scopeIds(?User $user): ?array
    {
        $nodes = app(StockKeeperVisibility::class)->scopeFor($user)['nodes'] ?? null;

        return $nodes === null ? null : array_map('intval', $nodes);
    }

    protected function mayOperate(?User $user, StockLocation $location): bool
    {
        if ($user === null) {
            return false;
        }

        $permissions = app(StockPermissions::class);

        if ($permissions->isAdmin($user) || $permissions->managerAllows($user, $location, FacilityManager::EDIT_PLANOGRAM)) {
            return true;
        }

        $scope = $this->scopeIds($user);

        return $user->roleKey() === 'stock_keeper' && ($scope === null || in_array((int) $location->id, $scope, true));
    }

    protected function authorizeLocation(?User $user, StockLocation $location): void
    {
        abort_unless($this->mayOperate($user, $location), 403, 'That place is not yours to work on.');
    }
}
