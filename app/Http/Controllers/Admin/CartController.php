<?php

namespace App\Http\Controllers\Admin;

use App\Models\Auth\Customer;
use App\Models\Seller\Cart;
use Inertia\Inertia;
use App\Models\Item\Item;
use App\Models\Store\Store;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use App\Models\Auth\User;



// HTTP Verb	URI	                    Action	  Route Name

// GET	        /carts	                index	  carts.index
// GET	        /carts/create        	create	  carts.create
// POST	        /carts	                store	  carts.store
// GET	        /carts/{cart}	        show	  carts.show
// GET	        /carts/{cart}/edit	    edit	  carts.edit
// PUT/PATCH	/carts/{cart}	        update	  carts.update
// DELETE	    /carts/{carts}	        destroy   carts.destroy

class CartController extends Controller
{
    use AuthorizesRequests;

    /**
     * Display a listing of the resource.
     */
    /**
     * Display all carts globally for the admin index.
     */
    public function index()
    {
        $carts = Cart::with(['customer', 'seller', 'store'])
            ->withCount('variants')
            ->visibleTo(auth()->user()) // Uses updated scope below
            ->latest()
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('Admin/Carts/Index', [
            'carts' => $carts,
        ]);
    }

    /**
     * Provide the necessary data for the React Create component.
     */
    public function create()
    {
        return Inertia::render('Admin/Carts/Create', [
            'customers' => Customer::all()->map(fn($c) => [
                'id' => $c->id,
                'name' => $c->name // Uses 'name' accessor from Customer model
            ]),
            'sellers' => User::where('role', 'seller')->get(['id', 'first_name', 'last_name']),
            'stores' => Store::all(['id', 'name']), // Critical for the "Select Store" dropdown
        ]);
    }

    /**
     * Handle global cart creation by admin.
     */
    public function store(Request $request)
    {
        $request->validate([
            'customer_id' => 'nullable|exists:customers,id',
            'seller_id' => 'nullable|exists:users,id,role,seller',
            'store_id' => 'required|exists:stores,id',
        ]);

        $cart = Cart::create([
            'store_id' => $request->store_id,
            'user_id' => auth()->id(),
            'customer_id' => $request->customer_id,
            'seller_id' => $request->seller_id,
            'status' => 'open',
            'session_id' => (string) mt_rand(100000, 999999),
        ]);

        return redirect()->route('admin.carts.index')->with('message', 'Global cart created.');
    }

    /**
     * Display the specified resource.
     */


    public function show(Cart $cart)
    {
        $cart->load(['customer', 'store', 'seller', 'variants.item', 'variants.itemPackagingType']);

        $lines = $cart->variants->map(fn ($variant): array => [
            'id' => (int) $variant->id,
            'product_name' => $variant->item?->product_name ?? 'Unknown',
            'sku' => $variant->sku,
            'packaging' => $variant->itemPackagingType?->name,
            'price' => (float) $variant->pivot->price,
            'quantity' => (int) $variant->pivot->quantity,
            'extra_pieces' => (int) ($variant->pivot->extra_pieces ?? 0),
            'extra_piece_price' => $variant->pivot->extra_piece_price !== null ? (float) $variant->pivot->extra_piece_price : null,
        ])->values();

        return Inertia::render('Admin/Carts/Show', [
            'cart' => [
                'id' => (int) $cart->id,
                'status' => (string) $cart->status,
                'store' => $cart->store?->name,
                'seller' => $cart->seller ? trim($cart->seller->first_name.' '.$cart->seller->last_name) : null,
                'customer' => $cart->customer?->name,
                'created_at' => $cart->created_at?->toIso8601String(),
                'items' => $lines,
                'total' => round($lines->sum(fn (array $l): float => $l['price'] * $l['quantity'] + ($l['extra_piece_price'] ?? 0) * $l['extra_pieces']), 2),
            ],
        ]);
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Cart $cart)
    {
        // Ensure the authenticated user owns the cart
        $this->authorize('update', $cart);

        return view('admin.carts.edit', compact('cart'));
    }

    // /**
    //  * Update the specified resource in storage.
    //  */
    // public function update(Request $request, Cart $cart)
    // {
    //     $request->validate([
    //         'name' => 'required|string|max:255',
    //         'status' => 'required|in:pending,completed,canceled',
    //     ]);

    //     // Update the cart details
    //     $cart->update([
    //         'name' => $request->name,
    //         'status' => $request->status,
    //     ]);

    //     // Redirect back to the cart index page with a success message
    //     return redirect()->route('admin.carts.index')->with('success', 'Cart updated successfully!');
    // }

    public function update(Request $request, Cart $cart)
    {
        // Validate input
        $request->validate([
            'customer_id' => 'required|exists:customers,id', // Ensure customer_id is provided and valid
        ]);

        // Update the cart
        $cart->update([
            'customer_id' => $request->customer_id, // Update the customer_id
        ]);

        // Redirect to the updated cart's details page with success message
        return redirect()->route('admin.carts.show', $cart->id)
            ->with('success', 'Cart updated successfully!');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy($id)
    {
        try {
            DB::transaction(function () use ($id) {
                $cart = Cart::findOrFail($id);

                // 1. Clear the pivot table items first (detach variants)
                // This assumes your relationship is named 'variants'
                if (method_exists($cart, 'variants')) {
                    $cart->variants()->detach();
                }

                // 2. Delete the actual cart record
                $cart->delete();
            });

            return redirect()->back()->with('message', 'Cart and its items were successfully removed.');

        } catch (\Exception $e) {
            Log::error("Failed to delete cart {$id}: " . $e->getMessage());

            return redirect()->back()->with('error', 'Failed to delete the cart. Please try again.');
        }
    }

    // Method to create a new cart or add an item to an existing cart
    public function addItem(Request $request, $itemId)
    {
        $item = Item::findOrFail($itemId);

        // Check if the user selected an existing cart or want to create a new one
        if ($request->filled('cart_id')) {
            // Add item to an existing cart
            $cart = Cart::findOrFail($request->input('cart_id'));
        } else {
            // If no cart selected, create a new cart
            $cart = Cart::create([
                'user_id' => auth()->id(),
            ]);
        }

        // Add the item to the cart (using the pivot table)
        $cart->items()->attach($item->id, [
            'quantity' => $request->input('quantity'),
            'price' => $item->price,
        ]);

        // Optionally, log the action
        Log::info('Item added to cart', [
            'cart_id' => $cart->id,
            'item_id' => $item->id,
            'quantity' => $request->input('quantity'),
        ]);

        // Redirect back to the cart or item list
        return redirect()->route('admin.carts.show', $cart->id)->with('success', 'Item added to cart!');
    }

    // Store an item in the cart
    public function storeItem(Request $request, Cart $cart)
    {
        $request->validate([
            'item_id' => 'required|exists:items,id',
            'quantity' => 'required|integer|min:1',
        ]);

        // Find the item
        $item = Item::findOrFail($request->item_id);

        // Add the item to the cart with its quantity and price
        $cart->items()->attach($item->id, [
            'quantity' => $request->quantity,
            'price' => $item->price, // Store the price of the item in the pivot table
        ]);

        // Redirect back to the cart show page with a success message
        return redirect()->route('admin.carts.show', $cart->id)->with('success', 'Item added to cart!');
    }
}
