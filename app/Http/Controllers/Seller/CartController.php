<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Seller\Cart;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

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
    public function index()
    {
        $carts = Cart::with(['customer', 'seller', 'items'])
            ->where(function ($query) {
                $query->where('seller_id', auth()->id())
                    ->orWhere('user_id', auth()->id());
            })
            ->latest()
            ->get();

        return Inertia::render('Seller/Orders/index', compact('carts'));
    }

    public function store(Request $request)
    {
        // Validate input
        $request->validate([
            'customer_id' => 'required|exists:customers,id', // Ensure customer_id is provided and valid
            // 'seller_id'=> 'required|exists:sellers,id',
            'seller_id' => 'required|exists:users,id,role,seller', // Ensure seller_id is valid and belongs to a seller
        ]);

        // Create the cart
        $cart = Cart::create([
            'user_id' => auth()->id(), // Ensure the cart is created by the authenticated user
            'customer_id' => $request->customer_id, // Set customer_id if provided
            'seller_id' => $request->seller_id, // Set seller_id if provided
        ]);

        // Redirect to the created cart's details page with success message
        // return redirect()->route('admin.carts.show', $cart->id)
        //                  ->with('success', 'Cart created successfully!');
        // Redirect or return response
        // return redirect()->route('admin.carts.index')->with('success', 'Cart created successfully!');
        // Redirect to the cart's detail page with a success message
        return redirect()->route('seller.orders.index')->with('success', 'Cart created successfully!');
    }

    /**
     * Store a newly created resource in storage.
     */
    // public function store(Request $request)
    // {
    //     // Validate input
    //     $request->validate([
    //         'customer_id' => 'nullable|exists:customers,id', // Ensure customer_id is valid if provided
    //     ]);

    //     // Create the cart
    //     $cart = Cart::create([
    //         'user_id' => auth()->id(), // Ensure the cart is created by the authenticated user
    //         'customer_id' => $request->customer_id, // Store the customer_id if selected, otherwise it will be null
    //     ]);

    //     // Redirect to the created cart's details page with success message
    //     return redirect()->route('admin.carts.show', $cart->id)
    //                      ->with('success', 'Cart created successfully!');
    // }
    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        $customers = Customer::all(); // Get all customers
        $sellers = User::where('role', 'seller')->get(); // assuming sellers have 'seller' role

        return Inertia::render('Seller/Carts/Create', compact('customers', 'sellers'));

    }

    /**
     * Display the specified resource.
     */
    public function show(Cart $cart)
    {
        // Ensure the authenticated user owns the cart
        $this->authorize('view', $cart);

        // Eager load the items related to this cart
        $cart->load(['items', 'customer', 'seller']);

        return Inertia::render('Seller/Carts/Show', compact('cart'));
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Cart $cart)
    {
        // Ensure the authenticated user owns the cart
        $this->authorize('update', $cart);

        $customers = Customer::all();
        $sellers = User::where('role', 'seller')->get();
        $cart->load(['customer', 'seller']);

        return Inertia::render('Seller/Carts/Edit', compact('cart', 'customers', 'sellers'));
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
            'seller_id' => 'nullable|exists:users,id',
        ]);

        // Update the cart
        $cart->update([
            'customer_id' => $request->customer_id, // Update the customer_id
            'seller_id' => $request->seller_id,
        ]);

        // Redirect to the updated cart's details page with success message
        return redirect()->route('seller.carts.show', $cart->id)
            ->with('success', 'Cart updated successfully!');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Cart $cart)
    {
        // Ensure the authenticated user owns the cart
        $this->authorize('delete', $cart);

        // Delete the cart
        $cart->delete();

        // Redirect back to the cart index page with a success message
        return redirect()->route('seller.orders.index')->with('success', 'Cart deleted successfully!');
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
        return redirect()->route('seller.carts.show', $cart->id)->with('success', 'Item added to cart!');
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
        return redirect()->route('seller.carts.show', $cart->id)->with('success', 'Item added to cart!');
    }

    public function add(Request $request)
    {

        $request->validate([
            'item_id' => 'required|exists:items,id',
            'quantity' => 'required|integer|min:1',
            'size' => 'nullable|string',
        ]);

        $cart = auth()->user()->currentCart(); // however you get the current cart

        $cart->items()->create([
            'item_id' => $request->item_id,
            'quantity' => $request->quantity,
            'price' => Item::find($request->item_id)->price,
            'options' => json_encode([
                'size' => $request->size,
            ]),
        ]);

        return redirect()->back()->with('success', 'Item added to cart!');
    }
}
