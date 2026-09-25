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

    public function index()
    {
        $user = auth()->user();

        $carts = Cart::with(['customer', 'seller', 'variants'])
            ->visibleTo($user)
            ->orderedByPriority() // Changed from ->latest()
            ->paginate(15);

        return Inertia::render('Seller/Carts/Index', [
            'carts' => $carts,
        ]);
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
     * Display the specified resource.
     */
    public function show(Cart $cart)
    {
        $this->authorize('view', $cart);
        $cart->load(['customer', 'variants.item']);

        $cartData = [
            'id' => $cart->id,
            'status' => $cart->status,
            'customer' => $cart->customer,
            'items' => $cart->variants->map(function ($variant) {
                return [
                    'id' => $variant->id,
                    'product_name' => $variant->item?->product_name ?? 'Unknown',
                    'packaging' => $variant->itemPackagingType?->name ?? null,
                    'pieces_per_unit' => $variant->calculateTotalPieces(),
                    'price' => (float) $variant->pivot->price,
                    'quantity' => $variant->pivot->quantity,
                    'extra_pieces' => $variant->pivot->extra_pieces ?? 0,
                    'extra_piece_price' => $variant->pivot->extra_piece_price,
                ];
            }),
        ];

        return Inertia::render('Seller/Carts/Show', ['cart' => $cartData]);
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

        $extraPiecePrice = $request->validated('extra_piece_price');
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
