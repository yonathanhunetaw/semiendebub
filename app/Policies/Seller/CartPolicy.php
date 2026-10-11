<?php

namespace App\Policies\Seller;

use App\Models\Auth\User;
use App\Models\Seller\Cart;

class CartPolicy
{
    /**
     * Can the user view the list?
     * (Handled by the Controller's where clause, but good to have)
     */
    public function viewAny(User $user): bool
    {
        return $user->hasRole('seller') || $user->hasRole('admin');
    }

    /**
     * Can the user see a specific cart?
     */
    public function view(User $user, Cart $cart): bool
    {
        if ($user->hasRole('admin')) {
            return true;
        }

        return $user->store_id === $cart->store_id;
    }

    public function update(User $user, Cart $cart): bool
    {
        return $this->view($user, $cart); // Same logic for editing
    }

    /**
     * Only an open cart (one that never became an order) is deleted, by the
     * seller who raised or holds it, a store manager of its store, or an
     * admin.
     */
    public function delete(User $user, Cart $cart): bool
    {
        if ($cart->status !== 'open') {
            return false;
        }

        if ($user->hasRole('admin')) {
            return true;
        }

        $own = (int) $cart->seller_id === (int) $user->id || (int) $cart->user_id === (int) $user->id;

        return (int) $user->store_id === (int) $cart->store_id && ($own || $user->hasRole('store_manager'));
    }
}
