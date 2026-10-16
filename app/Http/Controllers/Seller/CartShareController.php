<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller;

use App\Exceptions\CartShareException;
use App\Http\Controllers\Controller;
use App\Models\Seller\Cart;
use App\Services\Shared\CartShareService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * The seller shares a cart with its customer (a secret link, 7 days), or
 * takes the link back.
 */
class CartShareController extends Controller
{
    use AuthorizesRequests;

    public function __construct(private readonly CartShareService $shares)
    {
    }

    public function store(Request $request, Cart $cart): RedirectResponse
    {
        $this->authorize('update', $cart);

        try {
            $this->shares->share($cart, $request->user());
        } catch (CartShareException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()->route('seller.carts.index', ['cart' => $cart->id])
            ->with('success', 'Link ready. Send it to the customer: it works for '.CartShareService::LIFETIME_DAYS.' days.');
    }

    public function destroy(Request $request, Cart $cart): RedirectResponse
    {
        $this->authorize('update', $cart);
        $this->shares->revoke($cart, $request->user());

        return back()->with('success', 'Link turned off. The customer can no longer open it.');
    }
}
