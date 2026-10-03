<?php

declare(strict_types=1);

namespace App\Http\Controllers\Storefront;

use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\CheckoutRequest;
use App\Http\Requests\Storefront\StoreCartItemRequest;
use App\Http\Requests\Storefront\UpdateCartItemRequest;
use App\Models\Item\ItemVariant;
use App\Services\CartService;
use App\Services\Fulfillment\OrderSourcingService;
use App\Services\StorefrontCatalogService;
use Illuminate\Http\RedirectResponse;

/**
 * The shopper's single cart.
 *
 * Distinct from Seller\CartController, which manages many concurrent counter
 * carts: here there is exactly one cart per shopper, resolved from the session
 * while browsing as a guest and from the user id once signed in.
 */
class CartController extends Controller
{
    public function __construct(
        private readonly StorefrontCatalogService $catalog,
        private readonly CartService $cartService,
        private readonly OrderSourcingService $sourcing,
    ) {
    }

    public function store(StoreCartItemRequest $request): RedirectResponse
    {
        $store = $this->catalog->resolveStore();

        if (! $store) {
            return back()->with('error', 'The storefront is currently unavailable.');
        }

        $variant = ItemVariant::findOrFail($request->variantId());
        $storeVariant = $this->catalog->storeVariantFor($variant, $store);

        if (! $storeVariant) {
            return back()->with('error', 'That product is no longer stocked here.');
        }

        $available = $this->catalog->availableStock($storeVariant, $store);

        if ($available <= 0) {
            return back()->with('error', 'That product is out of stock.');
        }

        $packPrice = $this->catalog->payablePrice($storeVariant, $store);

        // Sub-units are priced off the pack that was chosen, so topping a carton
        // up with a few loose pieces charges the carton's rate for them.
        $rates = $this->cartService->proratedSubUnitPrices($variant, $packPrice);

        // Boxes are folded into pieces at that same rate. Prorating makes this
        // lossless — per_box is per_piece * box_units by construction — so the
        // line needs only one extras figure to bill either correctly.
        $extraPieces = $request->extraPieces();

        if ($request->extraBoxes() > 0) {
            if ($rates['box_units'] === null) {
                return back()->withErrors([
                    'extra_boxes' => 'This product is not sold in boxes at this store.',
                ]);
            }

            $extraPieces += $request->extraBoxes() * $rates['box_units'];
        }

        if ($extraPieces > 0 && $rates['per_piece'] === null) {
            return back()->withErrors([
                'extra_pieces' => 'This pack cannot be split into loose pieces.',
            ]);
        }

        $this->cartService->addVariantToBuyerCart(
            $this->cartService->currentBuyerCart($store, createIfMissing: true),
            $variant,
            $request->quantity(),
            $packPrice,
            $available,
            $extraPieces,
            $extraPieces > 0 ? round((float) $rates['per_piece'], 2) : null,
        );

        return back()->with('success', 'Added to your cart.');
    }

    public function update(UpdateCartItemRequest $request, ItemVariant $variant): RedirectResponse
    {
        $store = $this->catalog->resolveStore();
        $cart = $store ? $this->cartService->currentBuyerCart($store) : null;

        if (! $store || ! $cart) {
            return back()->with('error', 'Your cart is empty.');
        }

        $quantity = $request->quantity();
        $storeVariant = $this->catalog->storeVariantFor($variant, $store);

        if ($quantity > 0 && $storeVariant) {
            $quantity = min($quantity, max(1, $this->catalog->availableStock($storeVariant, $store)));
        }

        $this->cartService->setBuyerCartQuantity($cart, $variant, $quantity);

        return back();
    }

    public function destroy(ItemVariant $variant): RedirectResponse
    {
        $store = $this->catalog->resolveStore();
        $cart = $store ? $this->cartService->currentBuyerCart($store) : null;

        if ($store && $cart) {
            $this->cartService->removeVariantFromBuyerCart($cart, $variant);
        }

        return back()->with('success', 'Removed from your cart.');
    }

    /**
     * Gate the checkout.
     *
     * A guest is sent to sign in with the storefront stored as the intended
     * destination; their cart survives because it is keyed to the pre-login
     * session id, which AuthenticatedSessionController captures and hands to
     * CartService::mergeGuestCart().
     *
     * Two gates, in order: signed in, then agreed to any delay. The second is
     * the buyer's half of order sourcing — a basket holding a line that can only
     * be sent from a main warehouse will arrive later, and the agreement to that
     * is a condition of taking the payment rather than a notice shown alongside
     * it. CheckoutService refuses the same case server-side, so the rule holds
     * for any caller, not just this button.
     */
    public function checkout(CheckoutRequest $request): RedirectResponse
    {
        $store = $this->catalog->resolveStore();
        $cart = $store ? $this->cartService->currentBuyerCart($store) : null;

        if (! $store || ! $cart || $cart->variants()->count() === 0) {
            return back()->with('error', 'Your cart is empty.');
        }

        if (! auth()->check()) {
            session()->put('url.intended', route('storefront.index'));

            return redirect()
                ->route('login')
                ->with('success', 'Sign in to complete your order — your cart has been saved.');
        }

        $grouped = $this->sourcing->groupCart($cart, $store);

        if ($grouped['requires_agreement'] && ! $request->acceptsDelay()) {
            return back()->withErrors([
                'accept_delayed_items' => sprintf(
                    '%d item(s) in your cart can only be sent from our main warehouse and will arrive later. Please confirm you are happy to wait.',
                    $grouped['delayed_line_count'],
                ),
            ]);
        }

        // Payment itself is not wired up yet; the sourcing contract above is.
        return back()->with('success', 'Your cart is ready. Checkout and payment are coming soon.');
    }
}
