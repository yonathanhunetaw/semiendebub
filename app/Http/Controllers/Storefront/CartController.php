<?php

declare(strict_types=1);

namespace App\Http\Controllers\Storefront;

use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\StoreCartItemRequest;
use App\Http\Requests\Storefront\UpdateCartItemRequest;
use App\Models\Item\ItemVariant;
use App\Services\CartService;
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

        $this->cartService->addVariantToBuyerCart(
            $this->cartService->currentBuyerCart($store, createIfMissing: true),
            $variant,
            $request->quantity(),
            $this->catalog->payablePrice($storeVariant, $store),
            $available,
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
     */
    public function checkout(): RedirectResponse
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

        return back()->with('success', 'Your cart is ready. Checkout and payment are coming soon.');
    }
}
