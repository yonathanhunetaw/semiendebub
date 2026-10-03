<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Item\Item;
use App\Models\Seller\Cart;
use App\Services\Fulfillment\SellerOrderBoard;
use App\Services\Inventory\SellerLocationBoard;
use App\Services\ShipmentWorkflowService;
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

class MenuController extends Controller
{
    use AuthorizesRequests;

    /**
     * The seller's "More" hub.
     *
     * Feeds the order and shipment pipeline cards, the location strip and the
     * catalogue counters. Every number here is a real aggregate. Order tiles
     * come from SellerOrderBoard, the same mapping the order list uses, so a
     * badge and the tab it opens agree.
     */
    public function index(SellerOrderBoard $orderBoard, SellerLocationBoard $locationBoard)
    {
        $user = auth()->user();
        $storeId = (int) ($user?->store_id ?? 0);

        return Inertia::render('Seller/Menu/Index', [
            'locations' => $locationBoard->strip($storeId > 0 ? $storeId : null),
            'stats' => [
                'order_stages' => $orderBoard->counts($storeId > 0 ? $storeId : null),
                'shipments' => $this->shipmentPipeline($storeId),
                /*
                 * The one order counter that is real.
                 *
                 * The pipeline tiles above still count sample orders, but Pick &
                 * Pack is backed: these are paid sales whose lines have yet to be
                 * sourced from a location, which is what the queue screen lists.
                 */
                'orders' => [
                    'awaiting_sourcing' => \App\Models\Finance\Sale::query()
                        ->when($storeId > 0, fn ($query) => $query->forStore($storeId))
                        ->awaitingSourcing()
                        ->count(),
                ],
                'catalogue' => [
                    'customers' => Customer::count(),
                    'items' => Item::where('status', 'active')->count(),
                    'carts' => $this->ownCarts($user)->count(),
                ],
            ],
            'seller' => [
                'name' => trim((string) ($user?->first_name . ' ' . $user?->last_name)) ?: null,
                'email' => $user?->email,
                'store' => $user?->store?->name,
            ],
        ]);
    }

    /**
     * Carts this seller raised or owns — the "My Orders" scope.
     */
    private function ownCarts(?User $user)
    {
        return Cart::query()->where(function ($query) use ($user) {
            $query->where('seller_id', $user?->id)
                ->orWhere('user_id', $user?->id);
        });
    }

    /**
     * Shipment counts for the seller's store.
     *
     * These mirror ShipmentWorkflowService::legacyStatus() exactly, so a tile
     * badge here matches the count on the tab it links to. That means
     * `overdue` is exclusive, not additive: a past-due run that has not left
     * yet reads as overdue and is *not* also counted under manifest or
     * scheduled, which is how the shipments list buckets it.
     *
     * @return array<string, int>
     */
    private function shipmentPipeline(int $storeId): array
    {
        $empty = [
            'manifest' => 0,
            'scheduled' => 0,
            'en_route' => 0,
            'shipped' => 0,
            'overdue' => 0,
        ];

        if ($storeId === 0) {
            return $empty;
        }

        $base = static fn () => Shipment::query()->forStore($storeId);

        // Anything still short of the road can fall overdue.
        $preTransit = [
            ShipmentWorkflowService::DRAFT,
            ShipmentWorkflowService::PENDING_AGREEMENT,
            ShipmentWorkflowService::SCHEDULED,
            ShipmentWorkflowService::PICKING,
            ShipmentWorkflowService::READY,
        ];

        $onTime = static fn ($query) => $query->where(static function ($inner) {
            $inner->whereNull('scheduled_for')
                ->orWhere('scheduled_for', '>=', now());
        });

        return [
            // draft/pending_agreement/picking/ready all read as "pending" on
            // the list — the manifest is still open or the floor is picking.
            'manifest' => $onTime($base()->whereIn('status', [
                ShipmentWorkflowService::DRAFT,
                ShipmentWorkflowService::PENDING_AGREEMENT,
                ShipmentWorkflowService::PICKING,
                ShipmentWorkflowService::READY,
            ]))->count(),

            'scheduled' => $onTime(
                $base()->where('status', ShipmentWorkflowService::SCHEDULED)
            )->count(),

            // Dispatched and in-transit are both "on the road"; the list tab
            // covers the pair so a dispatched run is never invisible.
            'en_route' => $base()->whereIn('status', [
                ShipmentWorkflowService::DISPATCHED,
                ShipmentWorkflowService::IN_TRANSIT,
            ])->count(),

            'shipped' => $base()->whereIn('status', [
                ShipmentWorkflowService::DELIVERED,
                ShipmentWorkflowService::RECEIVED,
            ])->count(),

            'overdue' => $base()
                ->whereIn('status', $preTransit)
                ->whereNotNull('scheduled_for')
                ->where('scheduled_for', '<', now())
                ->count(),
        ];
    }

    public function store(Request $request)
    {
        //
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
        return redirect()->route('seller.carts.index')->with('success', 'Cart deleted successfully!');
    }

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

    // Method to create a new cart or add an item to an existing cart

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        $customers = Customer::all(); // Get all customers
        $sellers = User::where('role', 'seller')->get(); // assuming sellers have 'seller' role

        return Inertia::render('Seller/Carts/Create', compact('customers', 'sellers'));

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
}
