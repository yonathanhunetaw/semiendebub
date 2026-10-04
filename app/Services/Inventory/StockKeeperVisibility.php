<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;

/**
 * Which locations a stock keeper sees on the ledger, and may book stock into.
 *
 * Seeing:
 *   - admins and devs see everything;
 *   - otherwise the locations they manage (and, for a managed store, its shelf
 *     and floor);
 *   - a keeper who manages none sees their own store's locations;
 *   - a keeper with no managed location and no store sees everything.
 *
 * Operating (receive, recount): a location nobody manages stays open, so
 * nothing locks up before managers are assigned. Once it — or the store it
 * sits in — has managers, only they (and admins) may.
 */
class StockKeeperVisibility
{
    /**
     * @return array{nodes: array<int, int>, leaves: array<int, int>}|null  null = unrestricted
     */
    public function scopeFor(?User $user): ?array
    {
        if ($user === null) {
            return ['nodes' => [], 'leaves' => []];
        }

        if ($this->isAdmin($user)) {
            return null;
        }

        $managed = StockLocation::query()
            ->whereHas('managerAssignments', fn ($q) => $q->where('user_id', $user->id))
            ->pluck('id')
            ->map(fn ($id): int => (int) $id);

        if ($managed->isNotEmpty()) {
            $nodeIds = $managed
                ->merge(StockLocation::query()->whereIn('parent_id', $managed)->pluck('id')->map(fn ($id): int => (int) $id))
                ->unique();
        } elseif ($user->store_id !== null) {
            $nodeIds = StockLocation::query()
                ->where('store_id', $user->store_id)
                ->whereNotIn('kind', [StockLocation::KIND_MAIN_HUB, StockLocation::KIND_TRANSIT])
                ->pluck('id')
                ->map(fn ($id): int => (int) $id);
        } else {
            return null;
        }

        $leafIds = StockLocation::query()
            ->whereIn('id', $nodeIds)
            ->where('is_stockable', true)
            ->pluck('id')
            ->map(fn ($id): int => (int) $id);

        return ['nodes' => $nodeIds->values()->all(), 'leaves' => $leafIds->values()->all()];
    }

    /** May this user book stock into, or recount, this leaf? */
    public function mayOperate(?User $user, StockLocation $leaf): bool
    {
        if ($user === null) {
            return false;
        }

        if ($this->isAdmin($user)) {
            return true;
        }

        $managed = false;

        foreach (array_filter([$leaf, $leaf->parent]) as $node) {
            if ($node->isManagedBy($user)) {
                return true;
            }

            $managed = $managed || $node->managerAssignments()->exists();
        }

        return ! $managed;
    }

    private function isAdmin(User $user): bool
    {
        return in_array($user->roleKey(), ['admin', 'dev'], true);
    }
}
