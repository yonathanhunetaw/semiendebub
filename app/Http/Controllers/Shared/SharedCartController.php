<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared;

use App\Exceptions\CartCheckoutException;
use App\Exceptions\CartShareException;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\PaymentException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Shared\SharedCartItemRequest;
use App\Http\Requests\Shared\SharedCheckoutRequest;
use App\Http\Requests\Shared\SharedClaimRequest;
use App\Models\Seller\CartShare;
use App\Services\Shared\CartShareService;
use App\Services\Shared\SharedCartPresenter;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

/**
 * The customer's side of a shared cart: shared.<domain>/c/{token}. No login;
 * the link is the key, and it opens one cart and one customer only.
 */
class SharedCartController extends Controller
{
    public function __construct(
        private readonly CartShareService $shares,
        private readonly SharedCartPresenter $presenter,
    ) {
    }

    public function show(Request $request, string $token): Response|SymfonyResponse
    {
        $share = $this->shares->resolve($token);

        // Unknown, revoked or expired: one page for all three, so a link reveals nothing.
        if ($share === null) {
            return Inertia::render('Shared/Cart/Gone')->toResponse($request)->setStatusCode(404);
        }

        if ($share->checked_out_at !== null) {
            return Inertia::render('Shared/Cart/Order', [
                'token' => $token,
                'order' => $this->presenter->order($share),
            ]);
        }

        return Inertia::render('Shared/Cart/Show', [
            'token' => $token,
            'cart' => $this->presenter->cart($share),
        ]);
    }

    public function catalogue(Request $request, string $token): JsonResponse
    {
        $share = $this->live($token);
        $term = trim((string) $request->string('q'));

        return response()->json(['items' => $term === '' ? [] : $this->presenter->catalogue($share, mb_substr($term, 0, 60))]);
    }

    public function add(SharedCartItemRequest $request, string $token): RedirectResponse
    {
        $share = $this->live($token);

        return $this->attempt(function () use ($share, $request): RedirectResponse {
            $this->shares->add($share, (int) $request->validated('variant_id'), (int) $request->validated('quantity'));

            return back()->with('success', 'Added to your cart.');
        });
    }

    public function update(SharedCartItemRequest $request, string $token, int $variant): RedirectResponse
    {
        $share = $this->live($token);

        return $this->attempt(function () use ($share, $request, $variant): RedirectResponse {
            $this->shares->setQuantity($share, $variant, (int) $request->validated('quantity'));

            return back();
        });
    }

    public function checkout(SharedCheckoutRequest $request, string $token): RedirectResponse
    {
        $share = $this->live($token);

        return $this->attempt(function () use ($share, $request, $token): RedirectResponse {
            $sale = $this->shares->checkout($share, $request->validated());

            return redirect()->route('shared.cart.show', ['token' => $token])
                ->with('success', "Order {$sale->reference_number} placed. Send the payment, then tell us the reference.");
        });
    }

    public function claim(SharedClaimRequest $request, string $token, int $payment): RedirectResponse
    {
        $share = $this->live($token);

        return $this->attempt(function () use ($share, $request, $payment): RedirectResponse {
            $this->shares->claim($share, $payment, (string) $request->validated('reference'));

            return back()->with('success', 'Thank you. The store will confirm it as soon as the money arrives.');
        });
    }

    private function live(string $token): CartShare
    {
        return $this->shares->resolve($token) ?? abort(404);
    }

    private function attempt(Closure $step): RedirectResponse
    {
        try {
            return $step();
        } catch (CartShareException|CartCheckoutException|InsufficientStockException|PaymentException $e) {
            return back()->with('error', $e->getMessage());
        }
    }
}
