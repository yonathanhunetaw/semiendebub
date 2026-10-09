<?php

declare(strict_types=1);

namespace App\Policies\StockKeeper;

use App\Models\Auth\User;
use App\Services\Admin\ActiveStore;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;

/**
 * Who may rule on a transfer, and who may move it.
 *
 * The approval gate is the point of the policy. A machine-generated
 * replenishment proposal sits at `approval_state = pending` and must be
 * approved by the manager of the *destination* — replenishment is pulled, so the
 * person who owns the shelf owns the decision. An admin may always step in.
 *
 * Dispatch is separate and deliberately broader: once a proposal is approved,
 * moving the stock is ordinary floor work.
 */
class TransferPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isRole('admin', 'seller', 'stock_keeper', 'store_manager');
    }

    public function view(User $user, Transfer $transfer): bool
    {
        if ($user->isRole('admin')) {
            return $this->adminReaches($user, $transfer);
        }

        if ($user->isRole('stock_keeper')) {
            return true;
        }

        return $this->belongsToUsersStore($user, $transfer);
    }

    /**
     * Admit a proposal to the active transfer list.
     */
    public function approve(User $user, Transfer $transfer): bool
    {
        if (! $transfer->awaitsApproval()) {
            return false;
        }

        if ($user->isRole('admin')) {
            return $this->adminReaches($user, $transfer);
        }

        if (! $user->canApproveReplenishment()) {
            return false;
        }

        // The destination facility's manager, or the manager of the store the
        // destination location sits in.
        $destinationStore = $transfer->to_store_id !== null
            ? Store::find($transfer->to_store_id)
            : null;

        if ($destinationStore !== null && $destinationStore->isManagedBy($user)) {
            return true;
        }

        return $this->belongsToUsersStore($user, $transfer);
    }

    public function reject(User $user, Transfer $transfer): bool
    {
        return $this->approve($user, $transfer);
    }

    /**
     * Move the stock. Never available while approval is outstanding — that
     * check lives in TransferWorkflowService too, so an unapproved proposal is
     * refused whether it arrives through a policy-checked route or not.
     */
    public function dispatch(User $user, Transfer $transfer): bool
    {
        if ($transfer->awaitsApproval()) {
            return false;
        }

        return ($user->isRole('admin') && $this->adminReaches($user, $transfer))
            || $user->isRole('stock_keeper')
            || $this->belongsToUsersStore($user, $transfer);
    }

    public function cancel(User $user, Transfer $transfer): bool
    {
        return ($user->isRole('admin') && $this->adminReaches($user, $transfer))
            || $user->isRole('stock_keeper')
            || $this->belongsToUsersStore($user, $transfer);
    }

    /**
     * A global admin reaches every transfer; a store admin, those with one of
     * their stores at either end.
     */
    private function adminReaches(User $user, Transfer $transfer): bool
    {
        $ids = ActiveStore::accessibleIdsFor($user);

        return $ids === null
            || in_array((int) $transfer->from_store_id, $ids, true)
            || in_array((int) $transfer->to_store_id, $ids, true);
    }

    /** Is this transfer one of the user's own store's movements? */
    private function belongsToUsersStore(User $user, Transfer $transfer): bool
    {
        if ($user->store_id === null) {
            return false;
        }

        $storeId = (int) $user->store_id;

        return (int) $transfer->to_store_id === $storeId
            || (int) $transfer->from_store_id === $storeId;
    }
}
