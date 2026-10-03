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

    /**
     * The price of one loose piece of a variant, resolved server-side.
     *
     * "Extra pieces" are sold at the price of the product's piece-tier
     * variant — the same item, colour and size, packaged as single pieces.
     * That is exactly how the Seller item page derives it client-side
     * (itemShowHelpers::classifyPackagingTier + visiblePrice); this mirrors
     * the rule on the server so the figure cannot be dictated by the request.
     *
     * Returns null when the product has no piece-tier variant, in which case
     * loose pieces are not sellable for it.
     */
    /**
     * The same product, colour and size, packaged as loose pieces — what a
     * cart line's "extra pieces" are actually sold (and picked) as.
     */
    public function pieceVariantFor(ItemVariant $variant): ?ItemVariant
    {
        return ItemVariant::query()
            ->where('item_id', $variant->item_id)
            ->where('item_color_id', $variant->item_color_id)
            ->where('item_size_id', $variant->item_size_id)
            ->whereHas('itemPackagingType', function ($query): void {
                $query->whereRaw('LOWER(name) LIKE ?', ['%piece%'])
                    ->orWhereRaw('LOWER(name) LIKE ?', ['%pcs%']);
            })
            ->first();
    }

    public function resolveExtraPiecePrice(Cart $cart, ItemVariant $variant): ?float
    {
        $pieceVariant = $this->pieceVariantFor($variant);

        if (! $pieceVariant) {
            return null;
        }

        try {
            return $this->resolveLinePrice($cart, $pieceVariant);
        } catch (\RuntimeException) {
            // Not stocked or priced in this store: no loose-piece sale.
            return null;
        }
    }

    /**
     * What one sub-unit of a chosen pack costs, prorated from that pack.
     *
     * This is the rule the Seller item sheet has always shown: choose a Carton
     * at 9.51 holding 240 pieces in 20 boxes, and the nested "+ Boxes" and
     * "+ Pieces" rows read 0.48 and 0.04 — 9.51/20 and 9.51/240. A shopper
     * topping up a carton pays the carton's rate for the extras, not the
     * standalone piece price.
     *
     * Derived here rather than trusted from the request, so the figure cannot
     * be dictated by a crafted post — the same stance StoreCartItemRequest
     * takes on the line price itself.
     *
     * Note that prorating makes the two rates consistent by construction:
     * `per_box === per_piece * box_units`, so billing N extra boxes as
     * `N * box_units` extra pieces costs exactly the same as billing them as
     * boxes. That is what lets the cart store a single `extra_pieces` figure
     * without losing money either way.
     *
     * @return array{per_piece: float|null, per_box: float|null, pieces_per_unit: int, box_units: int|null}
     */
    public function proratedSubUnitPrices(ItemVariant $packVariant, float $packPrice): array
    {
        $piecesPerUnit = max(0, (int) $packVariant->calculateTotalPieces());
        $boxUnits = $this->boxUnitsFor($packVariant);

        $perPiece = $piecesPerUnit > 0 ? $packPrice / $piecesPerUnit : null;

        // Only meaningful when the chosen pack is bigger than a box.
        $perBox = $perPiece !== null && $boxUnits !== null && $boxUnits > 0 && $piecesPerUnit > $boxUnits
            ? $perPiece * $boxUnits
            : null;

        return [
            'per_piece' => $perPiece,
            'per_box' => $perBox,
            'pieces_per_unit' => $piecesPerUnit,
            'box_units' => $boxUnits,
        ];
    }

    /**
     * Pieces in one box of the same product, colour and size.
     *
     * Returns null when the product is not boxed, which is what suppresses the
     * "+ Boxes" row rather than offering a sub-unit that does not exist.
     */
    public function boxUnitsFor(ItemVariant $variant): ?int
    {
        $variant->loadMissing(['itemColor', 'itemSize']);

        $boxVariant = ItemVariant::query()
            ->where('item_id', $variant->item_id)
            ->where('item_color_id', $variant->item_color_id)
            ->where('item_size_id', $variant->item_size_id)
            ->whereHas(
                'itemPackagingType',
                fn ($query) => $query->whereRaw('LOWER(name) LIKE ?', ['%box%'])
            )
            ->first();

        if (! $boxVariant) {
            return null;
        }

        $units = (int) $boxVariant->calculateTotalPieces();

        return $units > 0 ? $units : null;
    }

    /*
    |--------------------------------------------------------------------------
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
        ?int $available = null,
        int $extraPieces = 0,
        ?float $extraPiecePrice = null
    ): void {
        $ceiling = (int) config('storefront.max_line_quantity', 999);

        if ($available !== null) {
            $ceiling = min($ceiling, $available);
        }

        DB::transaction(function () use (
            $cart,
            $variant,
            $quantity,
            $price,
            $ceiling,
            $extraPieces,
            $extraPiecePrice
        ): void {
            $existing = $cart->variants()->where('item_variants.id', $variant->id)->first();

            if ($existing) {
                $cart->variants()->updateExistingPivot($variant->id, [
                    'quantity' => min($ceiling, (int) $existing->pivot->quantity + $quantity),
                    'price' => $price,
                    // Extras accumulate alongside the units, as on the seller
                    // counter: adding to a line you already have tops it up.
                    'extra_pieces' => (int) $existing->pivot->extra_pieces + $extraPieces,
                    'extra_piece_price' => $extraPiecePrice ?? $existing->pivot->extra_piece_price,
                ]);

                return;
            }

            $cart->variants()->attach($variant->id, [
                'quantity' => min($ceiling, $quantity),
                'price' => $price,
                'extra_pieces' => $extraPieces,
                'extra_piece_price' => $extraPiecePrice,
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

        $sourcing = app(\App\Services\Fulfillment\OrderSourcingService::class);

        if (! $cart) {
            return [
                'id' => null,
                'lines' => [],
                'item_count' => 0,
                'subtotal' => 0.0,
                'is_guest' => $isGuest,
                'sourcing_groups' => [],
                'requires_delay_agreement' => false,
                'delayed_line_count' => 0,
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
            $extraPieces = (int) ($variant->pivot->extra_pieces ?? 0);
            $extraPiecePrice = $variant->pivot->extra_piece_price !== null
                ? (float) $variant->pivot->extra_piece_price
                : 0.0;

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
                // Loose sub-units topped onto the pack, at the pack's own rate.
                'extra_pieces' => $extraPieces,
                'extra_piece_price' => $extraPiecePrice,
                'line_total' => round(
                    ($unitPrice * $quantity) + ($extraPiecePrice * $extraPieces),
                    2
                ),
                'available_stock' => $storeVariant
                    ? $catalog->availableStock($storeVariant, $store)
                    : 0,
            ];
        })->values();

        /*
         * Where each line would come from, grouped by closest location.
         *
         * The drawer shows the basket split that way — "three of these are in
         * the store, this one comes from the hub" — and a hub line carries a
         * later promise the buyer has to accept before paying. Computed server
         * side because the stock figures and the hierarchy both live here.
         */
        $grouped = $sourcing->groupCart($cart, $store);

        return [
            'id' => (int) $cart->id,
            'lines' => $lines->all(),
            'item_count' => (int) $lines->sum('quantity'),
            'subtotal' => round((float) $lines->sum('line_total'), 2),
            'is_guest' => $isGuest,
            'sourcing_groups' => $grouped['groups'],
            'requires_delay_agreement' => $grouped['requires_agreement'],
            'delayed_line_count' => $grouped['delayed_line_count'],
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
        // roleKey(), not ->role: the latter is display-formatted ("Seller").
        return $user !== null && $user->isRole('seller');
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
