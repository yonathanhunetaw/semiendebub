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

    public function delete(User $user, Cart $cart): bool
    {
        return $user->hasRole('admin') || $user->store_id === $cart->store_id;
    }
}
