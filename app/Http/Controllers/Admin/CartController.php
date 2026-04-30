<?php

namespace App\Http\Controllers\Admin;

use App\Models\Auth\Customer;
use App\Models\Seller\Cart;
use Inertia\Inertia;
use App\Models\Item;
use App\Models\User;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;


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
        // 1. Start the query with global relationships
        $query = Cart::with(['customer', 'seller', 'store'])
            ->withCount('variants');

        // 2. Role-Based Scoping
        if (auth()->user()->role !== 'admin') {
            // If they aren't global admin, restrict to their store and their assigned carts
            $query->where('store_id', auth()->user()->store_id)
                ->where(function ($q) {
                    $q->where('seller_id', auth()->id())
                        ->orWhere('user_id', auth()->id())
                        ->orWhereNull('user_id'); // Capture guest carts for their store
                });
        }

        // 3. Execution (Using Pagination for high-volume ERP performance)
        $carts = $query->latest()
            ->paginate(15)
            ->withQueryString();

        // 4. Return to your new React Index
        return Inertia::render('Admin/Carts/Index', [
            'carts' => $carts,
        ]);
    }
    public function store(Request $request)
    {
        // 1. Validate - Note the use of 'seller' role check
        $request->validate([
            'customer_id' => 'nullable|exists:customers,id',
            'seller_id' => 'nullable|exists:users,id,role,seller',
            'status' => 'nullable|string',
        ]);

        // 2. Create the Cart
        // We use the Seller namespace Model to match your logic
        $cart = Cart::create([
            'store_id' => 1, // Temporarily hardcoded; eventually use auth()->user()->store_id
            'user_id' => auth()->id(), // The Admin/Staff who clicked "Create"
            'customer_id' => $request->customer_id,
            'seller_id' => $request->seller_id,
            'status' => $request->status ?? 'active',
            'session_id' => \Illuminate\Support\Str::uuid(), // Required for your migration logic
        ]);

        // 3. Redirect
        // Use 'message' or 'success' depending on what your Inertia layout expects
        return redirect()->route('admin.carts.index')
            ->with('message', 'Global cart initialized successfully!');
    }


    /**
     * Show the form for creating a new resource.
     */
public function create()
{
    $customers = Customer::select('id', 'first_name', 'last_name')
        ->get()
        ->map(function ($customer) {
            return [
                'id' => $customer->id,
                'name' => trim($customer->first_name . ' ' . $customer->last_name),
            ];
        });

    $sellers = User::where('role', 'seller')
        ->select('id', 'first_name', 'last_name')
        ->get();

    return inertia('Admin/Carts/Create', [
        'customers' => $customers,
        'sellers' => $sellers,
    ]);
}

    /**
     * Display the specified resource.
     */
    public function show(Cart $cart)
    {
        // Ensure the authenticated user owns the cart
        $this->authorize('view', $cart);

        // Eager load the items related to this cart
        $cart->load('items');

        return view('admin.carts.show', compact('cart'));
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
