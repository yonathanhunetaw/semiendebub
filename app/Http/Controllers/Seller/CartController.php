<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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
    public function index()
    {
        $user = auth()->user();

        $carts = Cart::with(['customer', 'seller', 'variants']) // Load the actual relationship
            ->visibleTo($user)
            ->latest()
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

        $customers = Customer::where('store_id', $storeId)->get();
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
        // Authorization check
        $this->authorize('view', $cart);

        // Load 'variants' and the 'item' they belong to
        $cart->load(['customer', 'variants.item']);

        $cartData = [
            'id' => $cart->id,
            'status' => $cart->status,
            'session_id' => $cart->session_id,
            'customer' => $cart->customer,
            'items' => $cart->variants->map(function ($variant) {
                return [
                    'id' => $variant->id,
                    'product_name' => $variant->item?->product_name ?? 'Unknown Item',
                    'price' => $variant->pivot->price,
                    'quantity' => $variant->pivot->quantity,
                ];
            }),
        ];

        return Inertia::render('Seller/Carts/Show', [
            'cart' => $cartData
        ]);
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
     * Add a variant to the cart (Works for Sellers, Customers, and Guests).
     */
    public function addVariant(Request $request, $variantId)
    {
        $variant = ItemVariant::findOrFail($variantId);

        $request->validate([
            'store_id' => 'required|exists:stores,id',
            'quantity' => 'required|integer|min:1',
            'price' => 'required|numeric|min:0',
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
            // Guest: Use the Session to identify them
            $sessionId = session()->getId();

            $cart = Cart::firstOrCreate([
                'session_id' => $sessionId, // You'll need to add this column to migrations
                'user_id' => null,
                'store_id' => $request->store_id,
                'status' => 'open',
            ]);
        }

        // 2. ADD THE VARIANT TO THE PIVOT (cart_items)
        $existing = $cart->variants()->where('item_variant_id', $variant->id)->first();

        if ($existing) {
            $cart->variants()->updateExistingPivot($variant->id, [
                'quantity' => $existing->pivot->quantity + $request->quantity,
                'price' => $request->price,
            ]);
        } else {
            $cart->variants()->attach($variant->id, [
                'quantity' => $request->quantity,
                'price' => $request->price,
                'store_id' => $cart->store_id,
            ]);
        }

        return redirect()->back()->with('success', 'Item added to cart!');
    }

    public function storeItem(Request $request, Cart $cart)
    {
        $this->authorize('update', $cart);

        $validated = $request->validate([
            'variant_id' => 'required|exists:item_variants,id',
            'quantity' => 'required|integer|min:1',
            'price' => 'required|numeric|min:0',
        ]);

        $variant = ItemVariant::findOrFail($validated['variant_id']);
        $existing = $cart->variants()->where('item_variant_id', $variant->id)->first();

        if ($existing) {
            $cart->variants()->updateExistingPivot($variant->id, [
                'quantity' => $existing->pivot->quantity + $validated['quantity'],
                'price' => $validated['price'],
                'store_id' => $cart->store_id,
            ]);
        } else {
            $cart->variants()->attach($variant->id, [
                'quantity' => $validated['quantity'],
                'price' => $validated['price'],
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
}
