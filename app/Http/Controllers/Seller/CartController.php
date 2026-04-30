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

        $carts = Cart::with(['customer', 'seller'])
            ->withCount('variants') // Adds 'variants_count' to the result automatically
            ->where('store_id', $user->store_id)
            ->where(function ($query) use ($user) {
                // Sellers see carts they are assigned to OR carts they created
                $query->where('seller_id', $user->id)
                    ->orWhere('user_id', $user->id)
                    // If it's a Guest cart with no user_id, but it's in their store
                    ->orWhereNull('user_id');
            })
            ->latest()
            ->paginate(15) // Senior dev move: never use get() for lists
            ->withQueryString();

        return Inertia::render('Seller/Carts/Index', [
            'carts' => $carts,
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        // Only show customers and sellers relevant to the current user's store context
        $storeId = auth()->user()->store_id;

        $customers = Customer::all();
        $sellers = User::where('role', 'seller')
            ->where('store_id', $storeId)
            ->get();

        return Inertia::render('Seller/Carts/Create', compact('customers', 'sellers'));
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $request->validate([
            'customer_id' => 'nullable|exists:customers,id',
            'seller_id' => 'nullable|exists:users,id,role,seller',
        ]);

        $cart = Cart::create([
            'store_id' => auth()->user()->store_id ?? 1,
            'user_id' => auth()->id(),
            'customer_id' => $request->customer_id,
            'seller_id' => $request->seller_id ?? (auth()->user()->role === 'seller' ? auth()->id() : null),
            'status' => 'active',
            // Generate a simple numeric session ID instead of a UUID
            'session_id' => (string) mt_rand(100000, 999999),
        ]);

        $routeName = auth()->user()->role === 'admin' ? 'admin.carts.index' : 'seller.carts.index';

        return redirect()->route($routeName)->with('message', 'Cart #' . $cart->session_id . ' created.');
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
                    // Accessing name from the Item through the Variant
                    'product_name' => $variant->item?->name ?? 'Unknown Item',
                    // Getting price and quantity from the cart_items pivot table
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
            'status' => 'required|in:pending,processing,completed,canceled',
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
                'status' => 'pending',
            ]);
        } else {
            // Guest: Use the Session to identify them
            $sessionId = session()->getId();

            $cart = Cart::firstOrCreate([
                'session_id' => $sessionId, // You'll need to add this column to migrations
                'user_id' => null,
                'store_id' => $request->store_id,
                'status' => 'pending',
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
}
