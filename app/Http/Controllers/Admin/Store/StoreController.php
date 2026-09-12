<?php

namespace App\Http\Controllers\Admin\Store;

use App\Http\Controllers\Controller;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantSellerPrice;
use App\Models\Store\StoreVariantIndividualPrice;
use App\Models\Auth\Customer;
use App\Services\PriceProvider;
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
        $paginator = Store::withCount('storeVariants')
            ->orderBy('name')
            ->paginate(10);
            
        $paginator->through(fn($s) => [
                'id' => $s->id,
                'name' => $s->name,
                'location' => $s->location,
                'manager' => $s->manager,
                'status' => $s->status,
                'store_variants_count' => $s->store_variants_count,
            ]);

        return Inertia::render('Admin/Inventory/Stores/index', [
            'stores' => $paginator,
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
        $paginatedItems = \App\Models\Item\Item::whereHas('variants.storeVariants', function($q) use ($store) {
            $q->where('store_id', $store->id);
        })
        ->with([
            'category',
            'variants' => function($q) use ($store) {
                $q->whereHas('storeVariants', function($q2) use ($store) {
                    $q2->where('store_id', $store->id);
                })
                ->with([
                    'itemColor', 'itemSize', 'itemPackagingType', 'packagingQuantities',
                    'storeVariants' => function($q2) use ($store) {
                        $q2->where('store_id', $store->id)
                           ->with([
                               'stocks',
                               'customerPrices.customer',
                               'sellerPrices.seller',
                               'individualPrice'
                           ]);
                    }
                ]);
            }
        ])
        ->paginate(25);

        $inventory = $paginatedItems->through(function ($item) use ($store) {
            $storeVariants = collect();
            foreach ($item->variants as $itemVariant) {
                foreach ($itemVariant->storeVariants as $sv) {
                    $sv->setRelation('itemVariant', $itemVariant);
                    $itemVariant->setRelation('item', $item);
                    $storeVariants->push($sv);
                }
            }

            $storeVariantIds = $storeVariants->pluck('id')->toArray();
            $batchStocks = app(\App\Services\StockService::class)->getBatchStock($storeVariantIds);

            $mappedVariants = $storeVariants->map(function ($sv) use ($store, $batchStocks) {
                // Use PriceProvider to get the price ladder
                $priceLadder = PriceProvider::getPriceLadder(
                    $sv->id,
                    $store->id,
                    null, // sellerId - can be passed from request if needed
                    null  // customerId - can be passed from request if needed
                );

                // Get the final price (highest priority - customer > seller > store)
                $finalPrice = PriceProvider::getFinalPrice($priceLadder);

                // Get the store-level base price (first in ladder)
                $basePrice = $priceLadder[0]['price'] ?? 0;
                $discountPrice = $priceLadder[0]['discount_price'] ?? null;
                $discountEndsAt = $priceLadder[0]['discount_ends_at'] ?? null;

                $store_stock = $batchStocks[$sv->id] ?? 0;
                $remote_stock = 0;
                if ($store->warehouse) {
                    $remote_stock = \App\Models\StockKeeper\ItemStock::where('location_type', \App\Models\Inventory\Warehouse::class)
                        ->where('location_id', $store->warehouse->id)
                        ->where('item_variant_id', $sv->itemVariant->id)
                        ->sum('quantity');
                }

                $pieces = $sv->itemVariant->calculateTotalPieces();
                $multiplier = $pieces > 0 ? $pieces : 1;

                    return [
                        'id' => $sv->id,
                        'sku' => $sv->itemVariant->sku ?? '—',
                        'label' => implode(' / ', array_filter([
                            $sv->itemVariant->itemColor?->name,
                            $sv->itemVariant->itemSize?->name,
                            $sv->itemVariant->itemPackagingType?->name ?? $sv->itemVariant->packagingQuantities->first()?->name,
                        ])) ?: $sv->itemVariant->sku,

                        // Base store prices
                        'price' => $basePrice,
                        'discount_price' => $discountPrice,
                        'discount_ends_at' => $discountEndsAt,
                        'final_price' => $finalPrice, // Add this for convenience
                        'active' => (bool) $sv->active,
                        'stock' => $store_stock,
                        'remote_stock' => $remote_stock,
                        'multiplier' => $multiplier,
                        'status' => $sv->active ? 'active' : 'inactive',

                        // Full price ladder (for debugging or advanced UI)
                        'price_ladder' => $priceLadder,

                        'customer_prices' => $sv->customerPrices->map(fn($cp) => [
                            'id' => $cp->id,
                            'customer_id' => $cp->customer_id,
                            'customer_name' => $cp->customer?->first_name ?? "Customer #{$cp->customer_id}",
                            'tin_number' => $cp->customer?->tin_number ?? null,
                            'customer_type' => $cp->customer?->tin_number ? 'individual' : 'business',
                            'price' => $cp->pricing_matrix['price'] ?? 0,
                            'discount_price' => $cp->pricing_matrix['discount_price'] ?? null,
                            'discount_ends_at' => $cp->pricing_matrix['discount_ends_at'] ?? null,
                        ])->values(),

                        'seller_prices' => $sv->sellerPrices->map(fn($sp) => [
                            'id' => $sp->id,
                            'seller_id' => $sp->seller_id,
                            'seller_name' => trim(($sp->seller?->first_name ?? '') . ' ' . ($sp->seller?->last_name ?? '')),
                            'price' => $sp->pricing_matrix['price'] ?? 0,
                            'discount_price' => $sp->pricing_matrix['discount_price'] ?? null,
                            'discount_ends_at' => $sp->pricing_matrix['discount_ends_at'] ?? null,
                            'business' => $sp->pricing_matrix['business'] ?? $sp->pricing_matrix,
                            'individual' => $sp->pricing_matrix['individual'] ?? null,
                        ])->values(),

                        'individual_price' => $sv->individualPrice ? [
                            'id'              => $sv->individualPrice->id,
                            'price'           => $sv->individualPrice->pricing_matrix['price'] ?? null,
                            'discount_price'  => $sv->individualPrice->pricing_matrix['discount_price'] ?? null,
                            'discount_ends_at'=> $sv->individualPrice->pricing_matrix['discount_ends_at'] ?? null,
                            'active'          => (bool) $sv->individualPrice->active,
                        ] : null,
                    ];
                })->values();

            return [
                'item_id' => $item->id,
                'item_name' => $item->product_name ?? 'Unknown Item',
                'category' => $item->category->category_name ?? 'N/A',
                'starting_price' => $mappedVariants->min('final_price'),
                'total_variants' => $storeVariants->count(),
                'total_stock' => $mappedVariants->reduce(
                    fn($carry, $mv) => $carry + ($mv['stock'] * $mv['multiplier']),
                    0
                ),
                'remote_total_stock' => $mappedVariants->reduce(
                    fn($carry, $mv) => $carry + ($mv['remote_stock'] * $mv['multiplier']),
                    0
                ),
                'variants' => $mappedVariants,
            ];
        });

        $customers = Customer::orderBy('first_name')->get(['id', 'first_name', 'last_name', 'tin_number']);
        $sellers = User::where('role', 'seller')
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'last_name']);

        return Inertia::render('Admin/Inventory/Stores/StoreInventory', [
            'store' => $store,
            'inventory' => $inventory,
            'customers' => $customers,
            'sellers' => $sellers,
        ]);
    }

    /**
     * Persist a new store.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:stores,name',
            'location' => 'nullable|string|max:255',
            'manager' => 'nullable|string|max:255',
            'status' => 'in:active,inactive',
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
            'name' => 'required|string|max:255|unique:stores,name,' . $store->id,
            'location' => 'nullable|string|max:255',
            'manager' => 'nullable|string|max:255',
            'status' => 'in:active,inactive',
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
    /**
     * Update the base price / discount on a store variant.
     * PATCH /store-variants/{storeVariant}
     */
    public function updateVariant(Request $request, StoreVariant $storeVariant)
    {
        $validated = $request->validate([
            'price' => 'required|numeric|min:0',
            'discount_price' => 'nullable|numeric|min:0',
            'discount_ends_at' => 'nullable|date',
            'active' => 'boolean',
        ]);

        // Get current pricing matrix and update it
        $pricingMatrix = $storeVariant->pricing_matrix ?? [];

        // Handle both formats: simple array or array with index 0
        if (isset($pricingMatrix[0]) && is_array($pricingMatrix[0])) {
            $pricingMatrix[0]['price'] = (float) $validated['price'];
            $pricingMatrix[0]['discount_price'] = $validated['discount_price'] ? (float) $validated['discount_price'] : null;
            $pricingMatrix[0]['discount_ends_at'] = $validated['discount_ends_at'];
        } else {
            $pricingMatrix['price'] = (float) $validated['price'];
            $pricingMatrix['discount_price'] = $validated['discount_price'] ? (float) $validated['discount_price'] : null;
            $pricingMatrix['discount_ends_at'] = $validated['discount_ends_at'];
        }

        $storeVariant->update([
            'pricing_matrix' => $pricingMatrix,
            'active' => $validated['active'] ?? $storeVariant->active,
        ]);

        $businessTier = isset($pricingMatrix[0]) && is_array($pricingMatrix[0])
            ? $pricingMatrix[0]
            : $pricingMatrix;
        $individualPrice = $storeVariant->individualPrice;
        $isAutoIndividualPrice = $individualPrice
            && (($individualPrice->pricing_matrix['auto_from_business'] ?? false) === true);

        if (!$individualPrice || $isAutoIndividualPrice) {
            $individualMatrix = [
                'price' => round(((float) $businessTier['price']) * 1.15, 2),
                'discount_price' => isset($businessTier['discount_price']) && $businessTier['discount_price'] !== null
                    ? round(((float) $businessTier['discount_price']) * 1.15, 2)
                    : null,
                'discount_ends_at' => $businessTier['discount_ends_at'] ?? null,
                'auto_from_business' => true,
            ];

            StoreVariantIndividualPrice::updateOrCreate(
                ['store_variant_id' => $storeVariant->id],
                ['pricing_matrix' => $individualMatrix, 'active' => true]
            );
        } else {
            $individualMatrix = $individualPrice->pricing_matrix;
            $individualMatrix['discount_ends_at'] = $businessTier['discount_ends_at'] ?? null;
            $individualPrice->update(['pricing_matrix' => $individualMatrix]);
        }

        // Reload with relationships
        $storeVariant->load([
            'customerPrices.customer',
            'sellerPrices.seller',
            'individualPrice',
            'itemVariant' => function ($q) {
                $q->with(['item.category', 'itemColor', 'itemSize', 'itemPackagingType', 'packagingQuantities']);
            },
            'stocks'
        ]);

        // Use PriceProvider to get the updated price ladder
        $priceLadder = PriceProvider::getPriceLadder(
            $storeVariant->id,
            $storeVariant->store_id,
            null,
            null
        );

        $basePrice = $priceLadder[0]['price'] ?? 0;
        $discountPrice = $priceLadder[0]['discount_price'] ?? null;
        $discountEndsAt = $priceLadder[0]['discount_ends_at'] ?? null;
        $finalPrice = PriceProvider::getFinalPrice($priceLadder);

        return response()->json([
            'success' => true,
            'variant' => [
                'id' => $storeVariant->id,
                'sku' => $storeVariant->itemVariant->sku ?? '—',
                // FIXED: Keep original label format, don't use SKU
                'label' => implode(' / ', array_filter([
                    $storeVariant->itemVariant->itemColor?->name,
                    $storeVariant->itemVariant->itemSize?->name,
                    $storeVariant->itemVariant->itemPackagingType?->name ?? $storeVariant->itemVariant->packagingQuantities->first()?->name,
                ])) ?: $storeVariant->itemVariant->sku,
                'price' => $basePrice,
                'discount_price' => $discountPrice,
                'discount_ends_at' => $discountEndsAt,
                'final_price' => $finalPrice,
                'active' => (bool) $storeVariant->active,
                'stock' => (int) $storeVariant->stocks->sum('quantity'),
                'status' => $storeVariant->active ? 'active' : 'inactive',
                'price_ladder' => $priceLadder,
                'customer_prices' => $storeVariant->customerPrices->map(fn($cp) => [
                    'id' => $cp->id,
                    'customer_id' => $cp->customer_id,
                    'customer_name' => $cp->customer?->first_name ?? "Customer #{$cp->customer_id}",
                    'tin_number' => $cp->customer?->tin_number ?? null,
                    'customer_type' => $cp->customer?->tin_number ? 'individual' : 'business',
                    'price' => $cp->pricing_matrix['price'] ?? 0,
                    'discount_price' => $cp->pricing_matrix['discount_price'] ?? null,
                    'discount_ends_at' => $cp->pricing_matrix['discount_ends_at'] ?? null,
                ]),
                'seller_prices' => $storeVariant->sellerPrices->map(fn($sp) => [
                    'id' => $sp->id,
                    'seller_id' => $sp->seller_id,
                    'seller_name' => trim(($sp->seller?->first_name ?? '') . ' ' . ($sp->seller?->last_name ?? '')),
                    'price' => $sp->pricing_matrix['price'] ?? 0,
                    'discount_price' => $sp->pricing_matrix['discount_price'] ?? null,
                    'discount_ends_at' => $sp->pricing_matrix['discount_ends_at'] ?? null,
                    'business' => $sp->pricing_matrix['business'] ?? $sp->pricing_matrix,
                    'individual' => $sp->pricing_matrix['individual'] ?? null,
                ]),
                'individual_price' => $storeVariant->individualPrice ? [
                    'id'               => $storeVariant->individualPrice->id,
                    'price'            => $storeVariant->individualPrice->pricing_matrix['price'] ?? null,
                    'discount_price'   => $storeVariant->individualPrice->pricing_matrix['discount_price'] ?? null,
                    'discount_ends_at' => $storeVariant->individualPrice->pricing_matrix['discount_ends_at'] ?? null,
                    'active'           => (bool) $storeVariant->individualPrice->active,
                ] : null,
            ],
        ]);
    }
    /**
     * Upsert a customer-specific price for a store variant.
     * POST /store-variants/{storeVariant}/customer-prices
     */
    public function upsertCustomerPrice(Request $request, StoreVariant $storeVariant)
    {
        $validated = $request->validate([
            'customer_id'      => 'required|exists:customers,id',
            'customer_type'    => 'required|in:business,individual',
            'price'            => 'required|numeric|min:0',
            'discount_price'   => 'nullable|numeric|min:0',
            'discount_ends_at' => 'nullable|date',
        ]);

        $customer = Customer::findOrFail($validated['customer_id']);
        $customerType = $customer->tin_number ? 'individual' : 'business';

        if ($validated['customer_type'] !== $customerType) {
            return response()->json([
                'message' => "Select an {$validated['customer_type']} customer for this price.",
            ], 422);
        }

        $pricingMatrix = [
            'price'            => (float) $validated['price'],
            'discount_price'   => isset($validated['discount_price']) ? (float) $validated['discount_price'] : null,
            'discount_ends_at' => $validated['discount_ends_at'] ?? null,
        ];

        $record = StoreVariantCustomerPrice::updateOrCreate(
            [
                'store_variant_id' => $storeVariant->id,
                'customer_id'      => $validated['customer_id'],
            ],
            [
                'pricing_matrix' => $pricingMatrix,
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
            'seller_id' => 'required|exists:users,id',
            'customer_type' => 'required|in:business,individual',
            'price' => 'required|numeric|min:0',
            'discount_price' => 'nullable|numeric|min:0',
            'discount_ends_at' => 'nullable|date',
        ]);

        $pricingTier = [
            'price'            => (float) $validated['price'],
            'discount_price'   => isset($validated['discount_price']) ? (float) $validated['discount_price'] : null,
            'discount_ends_at' => $validated['discount_ends_at'] ?? null,
        ];

        $record = StoreVariantSellerPrice::firstOrNew([
            'store_variant_id' => $storeVariant->id,
            'seller_id' => $validated['seller_id'],
        ]);

        $pricingMatrix = $record->pricing_matrix ?? [];
        if (!isset($pricingMatrix['business']) && !isset($pricingMatrix['individual']) && !empty($pricingMatrix)) {
            $pricingMatrix = ['business' => $pricingMatrix];
        }
        $pricingMatrix[$validated['customer_type']] = $pricingTier;

        $record->pricing_matrix = $pricingMatrix;
        $record->active = true;
        $record->save();

        return response()->json($record->load('seller'));
    }

    /**
     * Remove a seller-specific price.
     * DELETE /store-variant-seller-prices/{price}
     */
    public function destroySellerPrice(Request $request, StoreVariantSellerPrice $price)
    {
        $validated = $request->validate([
            'customer_type' => 'required|in:business,individual',
        ]);

        $pricingMatrix = $price->pricing_matrix ?? [];

        // Legacy seller prices have one shared tier, so deleting either view
        // removes the record. Tier-aware prices retain the other customer type.
        if (isset($pricingMatrix['business']) || isset($pricingMatrix['individual'])) {
            unset($pricingMatrix[$validated['customer_type']]);

            if (empty($pricingMatrix)) {
                $price->delete();
            } else {
                $price->update(['pricing_matrix' => $pricingMatrix]);
            }
        } else {
            $price->delete();
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Upsert the individual price for a store variant.
     * POST /store-variants/{storeVariant}/individual-price
     */
    public function upsertIndividualPrice(Request $request, StoreVariant $storeVariant)
    {
        $validated = $request->validate([
            'price'            => 'required|numeric|min:0',
            'discount_price'   => 'nullable|numeric|min:0',
            'discount_ends_at' => 'nullable|date',
            'active'           => 'boolean',
        ]);

        $businessMatrix = $storeVariant->pricing_matrix ?? [];
        $businessMatrix = isset($businessMatrix[0]) && is_array($businessMatrix[0])
            ? $businessMatrix[0]
            : $businessMatrix;

        $record = StoreVariantIndividualPrice::updateOrCreate(
            ['store_variant_id' => $storeVariant->id],
            [
                'pricing_matrix' => [
                    'price'            => (float) $validated['price'],
                    'discount_price'   => isset($validated['discount_price']) ? (float) $validated['discount_price'] : null,
                    'discount_ends_at' => $businessMatrix['discount_ends_at'] ?? null,
                    'auto_from_business' => false,
                ],
                'active' => $validated['active'] ?? true,
            ]
        );

        return response()->json([
            'id'               => $record->id,
            'price'            => $record->pricing_matrix['price'] ?? null,
            'discount_price'   => $record->pricing_matrix['discount_price'] ?? null,
            'discount_ends_at' => $record->pricing_matrix['discount_ends_at'] ?? null,
            'active'           => (bool) $record->active,
        ]);
    }

    /**
     * Remove the individual price override for a store variant.
     * DELETE /store-variant-individual-prices/{storeVariant}
     */
    public function destroyIndividualPrice(StoreVariant $storeVariant)
    {
        $storeVariant->individualPrice?->delete();

        return response()->json(['ok' => true]);
    }
}
