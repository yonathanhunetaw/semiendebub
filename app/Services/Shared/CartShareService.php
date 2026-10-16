<?php

declare(strict_types=1);

namespace App\Services\Shared;

use App\Exceptions\CartShareException;
use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Sale;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Seller\CartShare;
use App\Models\Store\StoreVariant;
use App\Services\CartService;
use App\Services\Finance\PaymentService;
use App\Services\Fulfillment\SellerOrderService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * A seller's cart, shared with its customer through a secret link.
 *
 *   share      the seller makes the link (7 days); sharing again revokes the old one
 *   resolve    the link opens its cart, and only its cart
 *   add / set  the customer changes quantities, removes lines, adds from the
 *              store's catalogue; every line is priced by CartService for this
 *              cart's customer and seller, exactly as the seller's screen does
 *   checkout   SellerOrderService::place, as the cart's seller would: the same
 *              sale, reservations, delivery and payment rows. Transfers only
 *   claim      the customer says a transfer was sent; the account owner or a
 *              manager confirms it (PaymentService::claimByCustomer)
 *
 * The link alone is the customer's key (owner decision 2026-10-16).
 */
class CartShareService
{
    public const LIFETIME_DAYS = 7;

    /** After checkout the link keeps showing the order for this long. */
    public const ORDER_VIEW_DAYS = 30;

    public function __construct(
        private readonly CartService $carts,
        private readonly SellerOrderService $orders,
        private readonly PaymentService $payments,
    ) {
    }

    /**
     * @return array{0: CartShare, 1: string} the share and its plain token (the link)
     */
    public function share(Cart $cart, User $by): array
    {
        if ($cart->status === 'completed') {
            throw new CartShareException('This cart is already an order.');
        }

        if ($cart->customer_id === null) {
            throw new CartShareException('Choose the customer first: the link shows their prices.');
        }

        if (! $cart->variants()->exists()) {
            throw new CartShareException('Add something to the cart before sharing it.');
        }

        return DB::transaction(function () use ($cart, $by): array {
            $this->revokeLive($cart, $by);

            $token = Str::random(48);

            $share = CartShare::query()->create([
                'cart_id' => $cart->id,
                'customer_id' => $cart->customer_id,
                'created_by' => $by->id,
                'token_hash' => self::hash($token),
                'token' => $token,
                'expires_at' => now()->addDays(self::LIFETIME_DAYS),
            ]);

            return [$share, $token];
        });
    }

    public function revoke(Cart $cart, User $by): void
    {
        $this->revokeLive($cart, $by);
    }

    /** The live share of a cart, if any. */
    public function liveFor(Cart $cart): ?CartShare
    {
        return CartShare::query()
            ->where('cart_id', $cart->id)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();
    }

    /** The share a link opens, or null when it is unknown, revoked or expired. */
    public function resolve(string $token): ?CartShare
    {
        if (strlen($token) < 32) {
            return null;
        }

        $share = CartShare::query()->where('token_hash', self::hash($token))->first();

        if ($share === null || ! $share->isLive()) {
            return null;
        }

        // The customer changed since the link was made: the link stays theirs only.
        if ($share->checked_out_at === null && (int) $share->cart?->customer_id !== (int) $share->customer_id) {
            return null;
        }

        $share->forceFill(['opened_at' => $share->opened_at ?? now(), 'last_seen_at' => now()])->save();

        return $share;
    }

    public static function url(string $token): string
    {
        return route('shared.cart.show', ['token' => $token]);
    }

    /*
    |--------------------------------------------------------------------------
    | The customer's changes
    |--------------------------------------------------------------------------
    */

    public function add(CartShare $share, int $variantId, int $quantity): void
    {
        $cart = $this->openCart($share);
        $variant = ItemVariant::query()->findOrFail($variantId);

        try {
            $price = $this->carts->resolveLinePrice($cart, $variant);
        } catch (\RuntimeException $e) {
            throw new CartShareException('That item is not sold in this store.');
        }

        $this->carts->addVariantToBuyerCart($cart, $variant, max(1, $quantity), $price);
        $this->edited($share);
    }

    public function setQuantity(CartShare $share, int $variantId, int $quantity): void
    {
        $cart = $this->openCart($share);
        $variant = $cart->variants()->where('item_variants.id', $variantId)->first()
            ?? throw new CartShareException('That item is not in this cart.');

        $this->carts->setBuyerCartQuantity($cart, $variant, $quantity);
        $this->edited($share);
    }

    /*
    |--------------------------------------------------------------------------
    | Checkout and paying
    |--------------------------------------------------------------------------
    */

    /**
     * The customer checks out: a courier to an address, or pickup in the
     * store. Paid by transfer to one of the store's collection accounts.
     *
     * @param  array{delivery_method: string, delivery_address?: string|null, customer_address_id?: int|null, recipient_name?: string|null, recipient_phone?: string|null, payment_account_id: int, delay_agreed?: bool, notes?: string|null}  $input
     */
    public function checkout(CartShare $share, array $input): Sale
    {
        $cart = $this->openCart($share);
        $seller = $this->sellerOf($share);

        $account = PaymentAccount::query()->collectingFor((int) $cart->store_id)->find((int) $input['payment_account_id'])
            ?? throw new CartShareException('Choose one of the store\'s accounts to pay into.');

        $total = $this->total($cart);

        return DB::transaction(function () use ($share, $cart, $seller, $input, $account, $total): Sale {
            $sale = $this->orders->place($cart, $seller, [
                'delivery_method' => $input['delivery_method'],
                'delivery_address' => $input['delivery_address'] ?? null,
                'customer_address_id' => $input['customer_address_id'] ?? null,
                'recipient_name' => $input['recipient_name'] ?? null,
                'recipient_phone' => $input['recipient_phone'] ?? null,
                'delay_agreed' => (bool) ($input['delay_agreed'] ?? false),
                // Courier fees are quoted by the store at dispatch, as for a seller's order.
                'delivery_option' => null,
                'parts' => [['payment_account_id' => $account->id, 'amount' => $total, 'transaction_reference' => null]],
            ]);

            if (! empty($input['notes'])) {
                $sale->update(['notes' => trim(($sale->notes ? $sale->notes."\n" : '').'Customer: '.$input['notes'])]);
            }

            $share->forceFill([
                'checked_out_at' => now(),
                'sale_id' => $sale->id,
                'expires_at' => now()->addDays(self::ORDER_VIEW_DAYS)->max($share->expires_at),
            ])->save();

            return $sale;
        });
    }

    /** "I've sent it": a part of this share's order, with the bank reference. */
    public function claim(CartShare $share, int $paymentId, ?string $reference): Payment
    {
        $sale = $share->sale ?? throw new CartShareException('This cart has not been checked out yet.');
        $payment = $sale->payments()->findOrFail($paymentId);

        return $this->payments->claimByCustomer($payment, $this->sellerOf($share), $reference);
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    /** The cart's lines at the prices stored on them (each set by resolveLinePrice). */
    public function total(Cart $cart): float
    {
        $cart->loadMissing('variants');

        return round((float) $cart->variants->sum(fn (ItemVariant $v) => (float) $v->pivot->price * (int) $v->pivot->quantity
            + (float) ($v->pivot->extra_piece_price ?? 0) * (int) ($v->pivot->extra_pieces ?? 0)), 2);
    }

    /** Is this variant sold (active) in the cart's store? */
    public function sellable(Cart $cart, int $variantId): bool
    {
        return StoreVariant::query()->where('store_id', $cart->store_id)->where('item_variant_id', $variantId)->where('active', true)->exists();
    }

    private function openCart(CartShare $share): Cart
    {
        $cart = $share->cart()->with('variants')->firstOrFail();

        if ($share->checked_out_at !== null || $cart->status === 'completed') {
            throw new CartShareException('This cart is already an order.');
        }

        return $cart;
    }

    private function sellerOf(CartShare $share): User
    {
        return $share->cart?->seller ?? $share->creator
            ?? throw new CartShareException('This cart has no seller any more. Ask the store to share it again.');
    }

    private function edited(CartShare $share): void
    {
        $share->forceFill(['customer_edited_at' => now()])->save();
    }

    private function revokeLive(Cart $cart, User $by): void
    {
        CartShare::query()
            ->where('cart_id', $cart->id)
            ->whereNull('revoked_at')
            ->whereNull('checked_out_at')
            ->update(['revoked_at' => now(), 'revoked_by' => $by->id]);
    }
}
