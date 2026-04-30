<?php

namespace App\Services;

use App\Models\Seller\Cart;
use Illuminate\Support\Facades\DB;
use App\Models\Auth\User;

class CartService
{
    /**
     * Merge a guest session cart into a user's permanent cart.
     */
    /**
     * Merge a guest session cart into a user's permanent cart.
     *
     * @param User $user
     * @param int $storeId
     * @param string|null $guestSessionId  <-- Add this parameter
     */
    public function mergeGuestCart($user, $storeId, $guestSessionId = null): void
    {
        // Use the provided guest ID, or fall back to the current session if not provided
        $sessionId = $guestSessionId ?? session()->getId();

        // 1. Find the guest cart using the specific ID
        $guestCart = Cart::where('session_id', $sessionId)
            ->whereNull('user_id')
            ->where('store_id', $storeId)
            ->first();

        if (!$guestCart) {
            return;
        }

        \DB::transaction(function () use ($guestCart, $user, $storeId) {
            // 2. Find or Create the User's active cart
            $userCart = Cart::firstOrCreate([
                'user_id' => $user->id,
                'store_id' => $storeId,
                'status' => 'pending',
            ]);

            // 3. Move items
            foreach ($guestCart->variants as $variant) {
                $existing = $userCart->variants()
                    ->where('item_variant_id', $variant->id)
                    ->first();

                if ($existing) {
                    $userCart->variants()->updateExistingPivot($variant->id, [
                        'quantity' => $existing->pivot->quantity + $variant->pivot->quantity
                    ]);
                } else {
                    $userCart->variants()->attach($variant->id, [
                        'quantity' => $variant->pivot->quantity,
                        'price' => $variant->pivot->price,
                        'store_id' => $storeId,
                    ]);
                }
            }

            // 4. Cleanup the ghost cart
            $guestCart->delete();
        });
    }
}
