<?php

namespace App\Http\Controllers\Admin\Store;

use App\Http\Controllers\Controller;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantSellerPrice;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use Illuminate\Http\Request;
use Inertia\Inertia;

class StoreController extends Controller
{
    /**
     * List all stores — used by both /stores and /inventory/stores.
     */
    public function index()
    {
        $stores = Store::withCount('storeVariants')
            ->orderBy('name')
            ->get()
            ->map(fn($s) => [
                'id'                   => $s->id,
                'name'                 => $s->name,
                'location'             => $s->location,
                'manager'              => $s->manager,
                'status'               => $s->status,
                'store_variants_count' => $s->store_variants_count,
            ]);

        return Inertia::render('Admin/Inventory/Stores/index', [
            'stores' => $stores,
        ]);
    }

    /**
     * Show the create-store form.
     */
    public function create()
    {
        return Inertia::render('Admin/Inventory/Stores/Create');
    }

    /**
     * Show a single store with its full inventory, plus data needed for the edit panel.
     */
    public function show(Store $store)
    {
        // Load: StoreVariants → ItemVariant → Item → Category
        //       StoreVariants → ItemVariant → Color / Size / PackagingType
        //       StoreVariants → Stocks
        //       StoreVariants → CustomerPrices → Customer
        //       StoreVariants → SellerPrices   → Seller
        $store->load([
            'storeVariants.itemVariant.item.category',
            'storeVariants.itemVariant.itemColor',
            'storeVariants.itemVariant.itemSize',
            'storeVariants.itemVariant.packagingQuantities',
            'storeVariants.stocks',
            'storeVariants.customerPrices.customer',
            'storeVariants.sellerPrices.seller',
        ]);

        // Group by parent Item
        $inventory = $store->storeVariants
            ->groupBy(fn($sv) => $sv->itemVariant->item_id)
            ->map(function ($variants, $itemId) {
                $firstVariant = $variants->first();
                $item         = $firstVariant->itemVariant->item;
                $category     = $item?->category;

                return [
                    'item_id'        => $itemId,
                    // FIX: Item uses `product_name`, not `name`
                    'item_name'      => $item->product_name ?? 'Unknown Item',
                    // FIX: ItemCategory uses `category_name`, not `name`
                    'category'       => $category->category_name ?? 'N/A',
                    'total_variants' => $variants->count(),
                    'total_stock'    => $variants->reduce(
                        fn($carry, $sv) => $carry + $sv->stocks->sum('quantity'),
                        0
                    ),
                    'variants' => $variants->map(fn($sv) => [
                        'id'    => $sv->id,
                        'sku'   => $sv->itemVariant->sku ?? '—',

                        // Human-readable variant label (Color / Size / Packaging)
                        'label' => implode(' / ', array_filter([
                            $sv->itemVariant->itemColor?->name,
                            $sv->itemVariant->itemSize?->name,
                            $sv->itemVariant->packagingQuantities->first()?->name,
                        ])) ?: $sv->itemVariant->sku,

                        // Base store-variant fields
                        'price'          => $sv->price,
                        'discount_price' => $sv->discount_price,
                        'discount_ends_at' => $sv->discount_ends_at,
                        'active'         => $sv->active,
                        'stock'          => $sv->stocks->sum('quantity'),
                        'status'         => $sv->active ? 'active' : 'inactive',

                        // Per-customer prices
                        'customer_prices' => $sv->customerPrices->map(fn($cp) => [
                            'id'               => $cp->id,
                            'customer_id'      => $cp->customer_id,
                            'customer_name'    => $cp->customer?->name ?? "Customer #{$cp->customer_id}",
                            'price'            => $cp->price,
                            'discount_price'   => $cp->discount_price,
                            'discount_ends_at' => $cp->discount_ends_at,
                        ])->values(),

                        // Per-seller prices
                        'seller_prices' => $sv->sellerPrices->map(fn($sp) => [
                            'id'               => $sp->id,
                            'seller_id'        => $sp->seller_id,
                            'seller_name'      => $sp->seller?->name ?? "Seller #{$sp->seller_id}",
                            'price'            => $sp->price,
                            'discount_price'   => $sp->discount_price,
                            'discount_ends_at' => $sp->discount_ends_at,
                        ])->values(),
                    ])->values(),
                ];
            })->values();

        // Available customers & sellers for the dropdowns in the edit panel
        $customers = Customer::orderBy('first_name')->get(['id', 'first_name']);
        $sellers   = User::where('role', 'seller')->orderBy('first_name')->get(['id', 'first_name']);

        return Inertia::render('Admin/Inventory/Stores/Show', [
            'store'     => $store,
            'inventory' => $inventory,
            'customers' => $customers,
            'sellers'   => $sellers,
        ]);
    }

    /**
     * Persist a new store.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name'     => 'required|string|max:255|unique:stores,name',
            'location' => 'nullable|string|max:255',
            'manager'  => 'nullable|string|max:255',
            'status'   => 'in:active,inactive',
        ]);

        Store::create($validated);

        return redirect()->route('store.index')->with('success', 'Store created successfully.');
    }

    /**
     * Show the edit form for a store.
     */
    public function edit(Store $store)
    {
        return Inertia::render('Admin/Inventory/Stores/Edit', [
            'store' => $store,
        ]);
    }

    /**
     * Update an existing store.
     */
    public function update(Request $request, Store $store)
    {
        $validated = $request->validate([
            'name'     => 'required|string|max:255|unique:stores,name,' . $store->id,
            'location' => 'nullable|string|max:255',
            'manager'  => 'nullable|string|max:255',
            'status'   => 'in:active,inactive',
        ]);

        $store->update($validated);

        return redirect()->route('store.index')->with('success', 'Store updated.');
    }

    /**
     * Delete a store.
     */
    public function destroy(Store $store)
    {
        $store->delete();

        return redirect()->route('store.index')->with('success', 'Store deleted.');
    }

    // -------------------------------------------------------------------------
    // AJAX endpoints for the variant edit panel
    // -------------------------------------------------------------------------

    /**
     * Update the base price / discount on a store variant.
     * PATCH /store-variants/{storeVariant}
     */
    public function updateVariant(Request $request, StoreVariant $storeVariant)
    {
        $validated = $request->validate([
            'price'            => 'required|numeric|min:0',
            'discount_price'   => 'nullable|numeric|min:0',
            'discount_ends_at' => 'nullable|date',
            'active'           => 'boolean',
        ]);

        $storeVariant->update($validated);

        return response()->json(['ok' => true]);
    }

    /**
     * Upsert a customer-specific price for a store variant.
     * POST /store-variants/{storeVariant}/customer-prices
     */
    public function upsertCustomerPrice(Request $request, StoreVariant $storeVariant)
    {
        $validated = $request->validate([
            'customer_id'      => 'required|exists:customers,id',
            'price'            => 'required|numeric|min:0',
            'discount_price'   => 'nullable|numeric|min:0',
            'discount_ends_at' => 'nullable|date',
        ]);

        $record = StoreVariantCustomerPrice::updateOrCreate(
            [
                'store_variant_id' => $storeVariant->id,
                'customer_id'      => $validated['customer_id'],
            ],
            [
                'price'            => $validated['price'],
                'discount_price'   => $validated['discount_price'] ?? null,
                'discount_ends_at' => $validated['discount_ends_at'] ?? null,
            ]
        );

        return response()->json($record->load('customer'));
    }

    /**
     * Remove a customer-specific price.
     * DELETE /store-variant-customer-prices/{price}
     */
    public function destroyCustomerPrice(StoreVariantCustomerPrice $price)
    {
        $price->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * Upsert a seller-specific price for a store variant.
     * POST /store-variants/{storeVariant}/seller-prices
     */
    public function upsertSellerPrice(Request $request, StoreVariant $storeVariant)
    {
        $validated = $request->validate([
            'seller_id'        => 'required|exists:users,id',
            'price'            => 'required|numeric|min:0',
            'discount_price'   => 'nullable|numeric|min:0',
            'discount_ends_at' => 'nullable|date',
        ]);

        $record = StoreVariantSellerPrice::updateOrCreate(
            [
                'store_variant_id' => $storeVariant->id,
                'seller_id'        => $validated['seller_id'],
            ],
            [
                'price'            => $validated['price'],
                'discount_price'   => $validated['discount_price'] ?? null,
                'discount_ends_at' => $validated['discount_ends_at'] ?? null,
            ]
        );

        return response()->json($record->load('seller'));
    }

    /**
     * Remove a seller-specific price.
     * DELETE /store-variant-seller-prices/{price}
     */
    public function destroySellerPrice(StoreVariantSellerPrice $price)
    {
        $price->delete();

        return response()->json(['ok' => true]);
    }
}
