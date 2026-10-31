<?php

declare(strict_types=1);

namespace App\Http\Controllers\Storefront;

use App\Exceptions\CartCheckoutException;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\PaymentException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\ClaimOnlinePaymentRequest;
use App\Http\Requests\Storefront\PlaceOnlineOrderRequest;
use App\Models\Finance\Sale;
use App\Services\Storefront\OnlineOrderService;
use App\Services\StorefrontCatalogService;
use Closure;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The online shop after the cart: the checkout page, placing the orders, and
 * My orders (paying, following, cancelling). Signed-in shoppers only; an
 * order is visible to the shopper who placed it and nobody else here.
 */
class OnlineOrderController extends Controller
{
    public function __construct(
        private readonly OnlineOrderService $online,
        private readonly StorefrontCatalogService $catalog,
    ) {
    }

    /** ?store=slug checks out that store's cart only; without it, the whole basket. */
    public function checkout(Request $request): Response|RedirectResponse
    {
        $only = $request->filled('store') ? $this->catalog->storeForRequest($request) : null;
        $props = $this->online->presentCheckout($request->user(), $only);

        if ($props['stores'] === []) {
            return redirect()->route('storefront.index')->with('error', 'Your cart is empty.');
        }

        return Inertia::render('User/Checkout/Index', $props + [
            // The shopper already agreed to wait in the cart (CartController::checkout).
            'delay_agreed' => $request->boolean('agreed'),
        ]);
    }

    public function place(PlaceOnlineOrderRequest $request): RedirectResponse
    {
        return $this->attempt(function () use ($request): RedirectResponse {
            $sales = $this->online->checkout($request->user(), $request->validated());

            if (count($sales) === 1) {
                return redirect()->route('storefront.orders.show', $sales[0]->reference_number)
                    ->with('success', "Order {$sales[0]->reference_number} placed. Send the payment, then tell us the reference.");
            }

            return redirect()->route('storefront.orders.index')
                ->with('success', sprintf('%d orders placed, one for each store. Send each payment, then tell us its reference.', count($sales)));
        });
    }

    public function index(Request $request): Response
    {
        return Inertia::render('User/Orders/Index', [
            'orders' => $this->online->list($request->user()),
        ]);
    }

    public function show(Request $request, Sale $sale): Response
    {
        $this->guard($request, $sale);

        return Inertia::render('User/Orders/Show', [
            'order' => $this->online->present($sale),
        ]);
    }

    public function claim(ClaimOnlinePaymentRequest $request, Sale $sale, int $payment): RedirectResponse
    {
        $this->guard($request, $sale);

        return $this->attempt(function () use ($sale, $payment, $request): RedirectResponse {
            $this->online->claim($sale, $payment, (string) $request->validated('reference'));

            return back()->with('success', 'Thank you. The store will confirm it as soon as the money arrives.');
        });
    }

    public function cancel(Request $request, Sale $sale): RedirectResponse
    {
        $this->guard($request, $sale);

        return $this->attempt(function () use ($sale, $request): RedirectResponse {
            $this->online->cancel($sale, $request->user());

            return back()->with('success', "Order {$sale->reference_number} cancelled.");
        });
    }

    /** Someone else's order, or a counter sale, is not found rather than forbidden: a reference reveals nothing. */
    private function guard(Request $request, Sale $sale): void
    {
        abort_unless($sale->shopper_id !== null && (int) $sale->shopper_id === (int) $request->user()->id, 404);
    }

    private function attempt(Closure $step): RedirectResponse
    {
        try {
            return $step();
        } catch (CartCheckoutException|InsufficientStockException|PaymentException $e) {
            return back()->with('error', $e->getMessage());
        }
    }
}
