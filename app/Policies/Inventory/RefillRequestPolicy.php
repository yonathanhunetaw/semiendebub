<?php

declare(strict_types=1);

namespace App\Policies\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\StockLocation;
use App\Services\Inventory\StockPermissions;

/**
 * Who may act on a refill suggestion. The rules themselves live in
 * StockPermissions (manager tick boxes, the store cascade, assigned stock
 * keepers), which the "Who can do what" pages also read.
 *
 * Floor legs never wait for anyone, so only Remote Hub and shipment legs are
 * acted on here. There is no approve: adding a suggestion to the Remote Hub
 * list or to a manifest is the approval.
 */
class RefillRequestPolicy
{
    public function __construct(private readonly StockPermissions $permissions)
    {
    }

    /** Put a store suggestion on the Remote Hub → Store list. */
    public function addToRemoteList(User $user, RefillRequest $request): bool
    {
        return $this->isSuggestion($request)
            && $request->target?->kind !== StockLocation::KIND_REMOTE_HUB
            && $this->hubOf($request) !== null
            && $this->permissions->canAddToRemoteList($user, (int) $request->store_id);
    }

    /** Put a suggestion on a shipment manifest. */
    public function addToManifest(User $user, RefillRequest $request): bool
    {
        return $this->isSuggestion($request)
            && $this->permissions->canAddToManifest($user, (int) $request->store_id);
    }

    /** Change a suggestion's amount while it still waits. */
    public function update(User $user, RefillRequest $request): bool
    {
        return $this->isSuggestion($request)
            && $this->permissions->canAdjustOrCancel($user, (int) $request->store_id);
    }

    /** Cancel a suggestion, or take it off the Remote Hub list before the hub accepts. */
    public function cancel(User $user, RefillRequest $request): bool
    {
        return $request->needsApproval()
            && ($request->status === RefillRequest::STATUS_PENDING || $request->awaitsHub())
            && $this->permissions->canAdjustOrCancel($user, (int) $request->store_id);
    }

    /** The Remote Hub agrees to send a leg on its list. */
    public function accept(User $user, RefillRequest $request): bool
    {
        $hub = $this->hubOf($request);

        return $request->awaitsHub()
            && $hub !== null
            && $this->permissions->canAcceptAtRemote($user, $hub);
    }

    private function isSuggestion(RefillRequest $request): bool
    {
        return $request->needsApproval() && $request->status === RefillRequest::STATUS_PENDING;
    }

    private function hubOf(RefillRequest $request): ?StockLocation
    {
        return StockLocation::query()
            ->where('store_id', $request->store_id)
            ->where('kind', StockLocation::KIND_REMOTE_HUB)
            ->first();
    }
}
