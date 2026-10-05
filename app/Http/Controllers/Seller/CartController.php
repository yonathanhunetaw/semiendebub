<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Http\Requests\Seller\ReorderCartsRequest;
use App\Http\Requests\Seller\StoreCartItemRequest;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use App\Services\CartService;

// HTTP Verb    URI                     Action    Route Name

// GET          /carts                  index     carts.index
// GET          /carts/create           create    carts.create
// POST         /carts                  store     carts.store
// GET          /carts/{cart}           show      carts.show
// GET          /carts/{cart}/edit      edit      carts.edit
// PUT/PATCH    /carts/{cart}           update    carts.update
// DELETE       /carts/{carts}          destroy   carts.destroy


class CartController extends Controller
{
    protected $cartService;
    use AuthorizesRequests;

    public function __construct(CartService $cartService)
    {
        $this->cartService = $cartService;
    }

    /**
     * Display a listing of the resource.
     */
    // app/Http/Controllers/Seller/CartController.php

    /**
     * The cart console.
     *
     * The screen shows the highest-priority cart in full and keeps the rest in
     * the "other carts" panel, so the payload carries line detail for every
     * cart — reordering promotes a different cart client-side and its lines
     * have to already be there.
     *
     * Lines are grouped by their `cart_items.store_id`: the seller's own store
     * is local stock, anything else is consolidated through the hub.
     *
     * `?cart={id}` opens that cart on screen without changing its saved
     * priority; it is how every "show this cart" link lands here.
     */
    public function index(Request $request)
    {
        $user = auth()->user();
        $homeStoreId = (int) ($user->store_id ?? 0);

        $carts = Cart::with([
            'customer',
            'seller',
            'variants.item',
            'variants.itemColor',
            'variants.itemSize',
        ])
            ->visibleTo($user)
            // Only carts that can still take items: a checked-out cart is
            // `completed` and lives on the Orders board, and add-to-cart only
            // ever offers open carts.
            ->open()
            ->orderedByPriority()
            ->get();

        $focusId = $request->integer('cart') ?: null;

        return Inertia::render('Seller/Carts/Index', [
            'carts' => $carts->map(fn (Cart $cart) => $this->presentCart($cart, $homeStoreId))->values()->all(),
            'home_store' => $user->store?->name,
            // Ignored unless it is one of the carts this seller can see.
            'focus_cart' => $focusId && $carts->contains('id', $focusId) ? $focusId : null,
        ]);
    }

    /**
     * Flatten one cart into the shape the cart screen renders.
     *
     * @return array<string, mixed>
     */
    private function presentCart(Cart $cart, int $homeStoreId): array
    {
        $lines = $cart->variants->map(function ($variant) use ($homeStoreId) {
            $quantity = (int) ($variant->pivot->quantity ?? 0);
            $price = (float) ($variant->pivot->price ?? 0);
            $extraPieces = (int) ($variant->pivot->extra_pieces ?? 0);
            $extraPrice = (float) ($variant->pivot->extra_piece_price ?? 0);
            $storeId = (int) ($variant->pivot->store_id ?? 0);

            return [
                'id' => $variant->id,
                'sku' => $variant->sku,
                'name' => $variant->item?->product_name ?? 'Item',
                'variant_label' => trim(implode(' / ', array_filter([
                    $variant->itemColor?->name,
                    $variant->itemSize?->name,
                ]))) ?: null,
                'image' => $variant->image_url,
                'quantity' => $quantity,
                'price' => $price,
                'extra_pieces' => $extraPieces,
                'line_total' => ($quantity * $price) + ($extraPieces * $extraPrice),
                'store_id' => $storeId,
                // Drives the two fulfillment groups on the cart screen.
                'fulfillment' => $storeId === $homeStoreId ? 'local' : 'hub',
            ];
        })->values();

        return [
            'id' => $cart->id,
            'status' => $cart->status,
            'priority' => $cart->priority,
            'customer' => $cart->customer ? [
                'name' => trim(($cart->customer->first_name ?? '') . ' ' . ($cart->customer->last_name ?? '')) ?: null,
                'type' => $cart->customer->active_pricing_customer_type ?? null,
            ] : null,
            'seller' => $cart->seller ? [
                'name' => trim(($cart->seller->first_name ?? '') . ' ' . ($cart->seller->last_name ?? '')) ?: null,
            ] : null,
            'line_count' => $lines->count(),
            'total' => round((float) $lines->sum('line_total'), 2),
            'lines' => $lines->all(),
        ];
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        $storeId = auth()->user()->store_id;

        $customers = Customer::query()
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get(['id', 'name', 'first_name', 'last_name', 'tin_number']);
        $sellers = User::where('role', 'seller')
            ->where('store_id', $storeId)
            ->get();

        return Inertia::render('Seller/Carts/Create', compact('customers', 'sellers'));
    }

    /**
     * Store a newly created resource in storage.
     */
    // App\Http\Controllers\Seller\CartController.php

    public function store(Request $request)
    {
        $isAdmin = auth()->user()->role === 'admin';

        $request->validate([
            'customer_id' => 'nullable|exists:customers,id',
            'seller_id' => 'nullable|exists:users,id,role,seller',
            'store_id' => $isAdmin ? 'required|exists:stores,id' : 'nullable', // Admin MUST pick a store
        ]);

        $cart = Cart::create([
            // If admin, take store from form. If seller, take from their profile.
            'store_id' => $isAdmin ? $request->store_id : auth()->user()->store_id,
            'user_id' => auth()->id(),
            'customer_id' => $request->customer_id,
            'seller_id' => $request->seller_id ?? ($isAdmin ? null : auth()->id()),
            'status' => 'open',
            'session_id' => (string) mt_rand(100000, 999999),
        ]);

        $routeName = $isAdmin ? 'admin.carts.index' : 'seller.carts.index';
        return redirect()->route($routeName)->with('message', 'Cart initialized.');
    }

    /**
     * A single cart opens in the cart console, on screen. There is one cart
     * page; this route stays because redirects and links name it.
     */
    public function show(Cart $cart)
    {
        $this->authorize('view', $cart);

        return redirect()->route('seller.carts.index', ['cart' => $cart->id]);
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Cart $cart)
    {
        $this->authorize('update', $cart);
        $storeId = auth()->user()->store_id;

        $customers = Customer::all();
        $sellers = User::where('role', 'seller')->where('store_id', $storeId)->get();

        $cart->load(['customer', 'seller']);

        return Inertia::render('Seller/Carts/Edit', compact('cart', 'customers', 'sellers'));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Cart $cart)
    {
        $this->authorize('update', $cart);

        $request->validate([
            'customer_id' => 'required|exists:customers,id',
            'seller_id' => 'nullable|exists:users,id',
            'status' => 'required|in:open,processing,completed,canceled',
        ]);

        $cart->update([
            'customer_id' => $request->customer_id,
            'seller_id' => $request->seller_id,
            'status' => $request->status,
        ]);

        return redirect()->route('seller.carts.show', $cart->id)
            ->with('success', 'Cart updated successfully!');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Cart $cart)
    {
        $this->authorize('delete', $cart);

        $cart->delete();

        return redirect()->route('seller.carts.index')->with('success', 'Cart deleted successfully!');
    }

    /**
     * Add a variant to the cart.
     * This replaces the old "addItem" and "storeItem" methods to be variant-aware.
     */
    /**
     * Add a variant to the cart (Works for Sellers, Customers, and s).
     */
    public function addVariant(Request $request, $variantId)
    {
        $variant = ItemVariant::findOrFail($variantId);

        // `price` is deliberately not accepted here either: this method is
        // currently unrouted, and taking a client price would reintroduce the
        // hole closed in storeItem() the moment it is wired up.
        $request->validate([
            'store_id' => 'required|exists:stores,id',
            'quantity' => 'required|integer|min:1',
        ]);

        // 1. FIND OR CREATE THE CART
        if (auth()->check()) {
            // Logged in: Find their active cart for this store
            $cart = Cart::firstOrCreate([
                'user_id' => auth()->id(),
                'store_id' => $request->store_id,
                'status' => 'open',
            ]);
        } else {
            // : Use the Session to identify them
            $sessionId = session()->getId();

            $cart = Cart::firstOrCreate([
                'session_id' => $sessionId, // You'll need to add this column to migrations
                'user_id' => null,
                'store_id' => $request->store_id,
                'status' => 'open',
            ]);
        }

        // 2. RESOLVE THE PRICE SERVER-SIDE
        try {
            $price = $this->cartService->resolveLinePrice($cart, $variant);
        } catch (\RuntimeException $e) {
            return back()->withErrors(['variant_id' => $e->getMessage()]);
        }

        // 3. ADD THE VARIANT TO THE PIVOT (cart_items)
        $existing = $cart->variants()->where('item_variant_id', $variant->id)->first();

        if ($existing) {
            $cart->variants()->updateExistingPivot($variant->id, [
                'quantity' => $existing->pivot->quantity + $request->quantity,
                'price' => $price,
            ]);
        } else {
            $cart->variants()->attach($variant->id, [
                'quantity' => $request->quantity,
                'price' => $price,
                'store_id' => $cart->store_id,
            ]);
        }

        return redirect()->back()->with('success', 'Item added to cart!');
    }

    public function storeItem(StoreCartItemRequest $request, Cart $cart)
    {
        $this->authorize('update', $cart);

        $variant = ItemVariant::findOrFail($request->variantId());

        // The unit price is never taken from the request: it is resolved from
        // the price ladder for this store and this cart's customer. This also
        // rejects a variant that is not active in the cart's store.
        try {
            $price = $this->cartService->resolveLinePrice($cart, $variant);
        } catch (\RuntimeException $e) {
            return back()->withErrors(['variant_id' => $e->getMessage()]);
        }

        // Derived from the product's piece-tier variant, never from the
        // request — the same hole that was closed on the main line price.
        $extraPiecePrice = $request->extraPieces() > 0
            ? $this->cartService->resolveExtraPiecePrice($cart, $variant)
            : null;

        if ($request->extraPieces() > 0 && $extraPiecePrice === null) {
            return back()->withErrors([
                'extra_pieces' => 'This product is not sold as loose pieces in this store.',
            ]);
        }
        $existing = $cart->variants()->where('item_variant_id', $variant->id)->first();

        if ($existing) {
            $cart->variants()->updateExistingPivot($variant->id, [
                'quantity' => $existing->pivot->quantity + $request->quantity(),
                'price' => $price,
                'extra_pieces' => $existing->pivot->extra_pieces + $request->extraPieces(),
                'extra_piece_price' => $extraPiecePrice ?? $existing->pivot->extra_piece_price,
                'store_id' => $cart->store_id,
            ]);
        } else {
            $cart->variants()->attach($variant->id, [
                'quantity' => $request->quantity(),
                'price' => $price,
                'extra_pieces' => $request->extraPieces(),
                'extra_piece_price' => $extraPiecePrice,
                'store_id' => $cart->store_id,
            ]);
        }

        return redirect()->route('seller.carts.show', $cart)->with('success', 'Variant added to cart successfully.');
    }

    public function destroyItem(Cart $cart, ItemVariant $variant)
    {
        $this->authorize('update', $cart);
        $cart->variants()->detach($variant->id);

        return back()->with('success', 'Item removed from cart.');
    }

    /**
     * Re-prioritise carts.
     *
     * Previously this wrote to any cart id supplied by the client with no
     * authorization, letting a seller reorder another store's carts. Every
     * cart is now resolved and passed through CartPolicy first, so a
     * cross-tenant id aborts the whole request with a 403 rather than
     * silently applying part of the reordering.
     */
    public function reorder(ReorderCartsRequest $request)
    {
        $cartIds = $request->cartIds();

        $carts = Cart::query()->whereIn('id', $cartIds)->get()->keyBy('id');

        foreach ($cartIds as $cartId) {
            $this->authorize('update', $carts[$cartId]);
        }

        DB::transaction(function () use ($cartIds, $carts): void {
            foreach ($cartIds as $index => $cartId) {
                $carts[$cartId]->update(['priority' => $index]);
            }
        });

        return redirect()->back()->with('success', 'Cart order updated.');
    }
}
