<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Seller\Cart;
use App\Models\Seller\CartShare;
use Carbon\CarbonInterface;

/**
 * The story of one cart, newest first: who opened it, who it was handed to,
 * every time something was put in it, each link shared with the customer and
 * the sale it turned into. Built from what is already stored (the cart, its
 * lines, its share links and its sales); nothing is logged separately.
 */
class CartHistory
{
    /**
     * @return array<int, array{kind: string, title: string, detail: string|null, by: string|null, at: string}>
     */
    public function for(Cart $cart): array
    {
        $cart->loadMissing(['user', 'seller', 'customer', 'variants.item']);

        $events = [];
        $push = function (string $kind, string $title, ?string $detail, ?string $by, ?CarbonInterface $at) use (&$events): void {
            if ($at !== null) {
                $events[] = ['kind' => $kind, 'title' => $title, 'detail' => $detail, 'by' => $by, 'at' => $at->toIso8601String()];
            }
        };

        $push('created', 'Cart opened', $cart->customer?->name ? 'For '.$cart->customer->name : 'No customer yet', $this->name($cart->user), $cart->created_at);

        if ($cart->seller_id !== null && $cart->seller_id !== $cart->user_id) {
            $push('seller', 'Handed to a seller', $this->name($cart->seller), $this->name($cart->user), $cart->created_at);
        }

        foreach ($cart->variants as $variant) {
            $quantity = (int) $variant->pivot->quantity;
            $push('item', 'Item added', ($variant->item?->product_name ?? 'Unknown').' × '.$quantity, $this->name($cart->seller), $variant->pivot->created_at);
        }

        $shares = CartShare::query()->where('cart_id', $cart->id)->with('creator')->get();

        foreach ($shares as $share) {
            $push('share', 'Link shared with the customer', null, $this->name($share->creator), $share->created_at);
            $push('opened', 'Customer opened the link', null, null, $share->opened_at);
            $push('edited', 'Customer changed the cart', null, null, $share->customer_edited_at);
            $push('revoked', 'Link revoked', null, null, $share->revoked_at);
        }

        Sale::query()->where('cart_id', $cart->id)->with('user')->get()->each(function (Sale $sale) use ($push): void {
            $push('sale', 'Became an order', $sale->reference_number.' · '.number_format((float) $sale->total_amount, 2).' ETB', $this->name($sale->user), $sale->created_at);
        });

        usort($events, fn (array $a, array $b): int => strcmp($b['at'], $a['at']));

        return $events;
    }

    private function name(?User $user): ?string
    {
        if ($user === null) {
            return null;
        }

        $name = trim($user->first_name.' '.$user->last_name);

        return $name !== '' ? $name : ($user->email ?: null);
    }
}
