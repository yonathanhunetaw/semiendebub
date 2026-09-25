<?php

namespace App\Services;

use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
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

    /*
    |--------------------------------------------------------------------------
<<<<<<< HEAD
=======
    | Authoritative line pricing
    |--------------------------------------------------------------------------
    */

    /**
     * The price a cart line must be stamped with, resolved server-side.
     *
     * Callers previously trusted a `price` field from the request, which let a
     * crafted payload set any amount. The price ladder is the single source of
     * truth: base store price, then the individual/seller/customer overrides
     * that apply to this cart's customer.
     *
     * @throws \RuntimeException when the variant is not sellable in this store
     */
    public function resolveLinePrice(Cart $cart, ItemVariant $variant, ?int $sellerId = null): float
    {
        $storeVariant = \App\Models\Store\StoreVariant::query()
            ->where('item_variant_id', $variant->id)
            ->where('store_id', $cart->store_id)
            ->where('active', true)
            ->first();

        if (! $storeVariant) {
            throw new \RuntimeException('That variant is not available in this store.');
        }

        $cart->loadMissing('customer');
        $customer = $cart->customer;

        // A cart with no customer is a walk-in, which PriceProvider prices as
        // an individual; a registered customer is individual only with a TIN.
        $customerType = $customer === null || ! empty($customer->tin_number)
            ? 'individual'
            : 'business';

        $ladder = PriceProvider::getPriceLadder(
            (int) $storeVariant->id,
            (int) $cart->store_id,
            $sellerId ?? $cart->seller_id,
            $customer?->id,
        );

        if (empty($ladder)) {
            throw new \RuntimeException('That variant has no price configured in this store.');
        }

        return PriceProvider::getFinalPriceWithTax($ladder, $customerType);
    }

    /*
    |--------------------------------------------------------------------------
>>>>>>> e13f568 (second week session)
    | Buyer (public storefront) cart
    |--------------------------------------------------------------------------
    |
    | The seller workspace juggles many concurrent carts, one per customer on
    | the counter. The storefront is the opposite: exactly one cart belongs to
    | the current shopper, keyed by user id when signed in and by session id
    | while browsing as a guest.
    |
    | Carts are created with the status configured in config/storefront.php so
    | that mergeGuestCart() above adopts them verbatim at sign-in.
    |
    */

    /**
     * The current shopper's single cart, or null when they have never added
     * anything and $createIfMissing is false.
     */
    public function currentBuyerCart(Store $store, bool $createIfMissing = false): ?Cart
    {
        $status = (string) config('storefront.cart_status', 'pending');

        $attributes = auth()->check()
            ? ['user_id' => auth()->id(), 'store_id' => $store->id, 'status' => $status]
            : ['session_id' => session()->getId(), 'user_id' => null, 'store_id' => $store->id, 'status' => $status];

        $cart = Cart::query()->where($attributes)->latest('id')->first();

        if ($cart || ! $createIfMissing) {
            return $cart;
        }

        return $this->createBuyerCart($attributes);
    }

    /**
     * Add units of a variant to the shopper's cart, stacking onto any line
     * that already holds it.
     *
     * $available is the stock ceiling and is applied to the resulting line
     * total, not just to this increment — otherwise repeated adds would walk a
     * line past the stock on hand.
     */
    public function addVariantToBuyerCart(
        Cart $cart,
        ItemVariant $variant,
        int $quantity,
        float $price,
        ?int $available = null
    ): void {
        $ceiling = (int) config('storefront.max_line_quantity', 999);

        if ($available !== null) {
            $ceiling = min($ceiling, $available);
        }

        DB::transaction(function () use ($cart, $variant, $quantity, $price, $ceiling): void {
            $existing = $cart->variants()->where('item_variants.id', $variant->id)->first();

            if ($existing) {
                $cart->variants()->updateExistingPivot($variant->id, [
                    'quantity' => min($ceiling, (int) $existing->pivot->quantity + $quantity),
                    'price' => $price,
                ]);

                return;
            }

            $cart->variants()->attach($variant->id, [
                'quantity' => min($ceiling, $quantity),
                'price' => $price,
                'store_id' => $cart->store_id,
            ]);
        });
    }

    /**
     * Set an explicit quantity on a line; a quantity of zero removes it.
     */
    public function setBuyerCartQuantity(Cart $cart, ItemVariant $variant, int $quantity): void
    {
        if ($quantity <= 0) {
            $this->removeVariantFromBuyerCart($cart, $variant);

            return;
        }

        $cart->variants()->updateExistingPivot($variant->id, [
            'quantity' => min((int) config('storefront.max_line_quantity', 999), $quantity),
        ]);
    }

    public function removeVariantFromBuyerCart(Cart $cart, ItemVariant $variant): void
    {
        $cart->variants()->detach($variant->id);
    }

    /**
     * Shape a cart for the storefront drawer, matching the StorefrontCart
     * contract in resources/js/types/storefront.ts.
     *
     * @return array<string, mixed>
     */
    public function presentBuyerCart(?Cart $cart, Store $store): array
    {
        $isGuest = ! auth()->check();

        if (! $cart) {
            return [
                'id' => null,
                'lines' => [],
                'item_count' => 0,
                'subtotal' => 0.0,
                'is_guest' => $isGuest,
            ];
        }

        $catalog = app(StorefrontCatalogService::class);

        $cart->loadMissing([
            'variants.item',
            'variants.itemColor',
            'variants.itemSize',
            'variants.itemPackagingType',
        ]);

        $lines = $cart->variants->map(function (ItemVariant $variant) use ($catalog, $store) {
            $storeVariant = $catalog->storeVariantFor($variant, $store);
            $unitPrice = (float) $variant->pivot->price;
            $quantity = (int) $variant->pivot->quantity;

            return [
                'variant_id' => (int) $variant->id,
                // Lets the grid show an "n in cart" hint on the parent product.
                'item_id' => (int) ($variant->item_id ?? 0),
                'title' => (string) ($variant->item?->product_name ?? 'Unnamed product'),
                'variant_label' => $this->variantLabel($variant),
                'sku' => $variant->sku,
                'image_url' => $variant->image_url,
                'unit_price' => $unitPrice,
                'quantity' => $quantity,
                'line_total' => round($unitPrice * $quantity, 2),
                'available_stock' => $storeVariant
                    ? $catalog->availableStock($storeVariant, $store)
                    : 0,
            ];
        })->values();

        return [
            'id' => (int) $cart->id,
            'lines' => $lines->all(),
            'item_count' => (int) $lines->sum('quantity'),
            'subtotal' => round((float) $lines->sum('line_total'), 2),
            'is_guest' => $isGuest,
        ];
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function createBuyerCart(array $attributes): Cart
    {
        $cart = Cart::create($attributes);

        // Cart::booted() stamps seller_id with the authenticated user so the
        // seller counter can attribute a sale. A shopper is not a seller, so
        // undo that here rather than leaving a misleading attribution.
        if ($cart->seller_id !== null && ! $this->isSeller(auth()->user())) {
            $cart->forceFill(['seller_id' => null])->save();
        }

        return $cart;
    }

    private function isSeller(?User $user): bool
    {
        return $user !== null && strtolower((string) $user->role) === 'seller';
    }

    /**
     * Human-readable variant descriptor, e.g. "Blue · A4 · Box of 12".
     */
    private function variantLabel(ItemVariant $variant): string
    {
        $parts = array_filter([
            $variant->itemColor?->name,
            $variant->itemSize?->name,
            $variant->itemPackagingType?->name,
        ]);

        return $parts === [] ? 'Standard' : implode(' · ', $parts);
    }
}
