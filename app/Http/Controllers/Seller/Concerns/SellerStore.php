<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller\Concerns;

use Illuminate\Http\Request;

/**
 * Which store the seller app shows this user.
 *
 * Their own store; every store (null) only for a global admin or dev; and for
 * anyone else without a store, store 0, which matches nothing. A seller saved
 * with no store must not see every store's orders and customers.
 */
trait SellerStore
{
    protected static function sellerStoreId(Request $request): ?int
    {
        $user = $request->user();

        if ($user === null) {
            return 0;
        }

        if ($user->store_id !== null) {
            return (int) $user->store_id;
        }

        $global = $user->roleKey() === 'dev' || $user->isGlobalAdmin();

        return $global ? null : 0;
    }
}
