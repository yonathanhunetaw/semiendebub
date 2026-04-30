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
        return $user->hasRole('seller');
    }

    /**
     * Can the user see a specific cart?
     */
    public function view(User $user, Cart $cart): bool
    {
        // 1. Must be the same store
        if ($user->store_id !== $cart->store_id) {
            return false;
        }

        // 2. Must be the creator, the assigned seller, or an admin
        return $user->id === $cart->user_id ||
            $user->id === $cart->seller_id ||
            $user->hasRole('admin');
    }

    public function update(User $user, Cart $cart): bool
    {
        return $this->view($user, $cart); // Same logic for editing
    }

    public function delete(User $user, Cart $cart): bool
    {
        // Only the creator or an admin can delete a cart
        return $user->id === $cart->user_id || $user->hasRole('admin');
    }
}
