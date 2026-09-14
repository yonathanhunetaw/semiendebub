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
use App\Models\StockKeeper\Transfer;
use App\Models\StockKeeper\ItemStock;
use App\Models\Inventory\ItemInventoryLocation;
use Carbon\Carbon;

class StoreController extends Controller
{
    /**
     * List all stores.
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

    public function create()
    {
        return Inertia::render('Admin/Inventory/Stores/Create');
    }

    /**
     * Show a single store with its full inventory.
     */
    public function show(Store $store)
    {
        $paginatedItems = \App\Models\Item\Item::whereHas('variants.storeVariants', function ($q) use ($store) {
            $q->where('store_id', $store->id);
        })
            ->with([
                'category',
                'variants' => function ($q) use ($store) {
                    $q->whereHas('storeVariants', function ($q2) use ($store) {
                        $q2->where('store_id', $store->id);
                    })
                        ->with([
                            'itemColor',
                            'itemSize',
                            'itemPackagingType',
                            'packagingQuantities',
                            'storeVariants' => function ($q2) use ($store) {
                                $q2->where('store_id', $store->id)
                                    ->with([
                                        'stocks',
                                        'customerPrices.customer',
                                        'sellerPrices.seller',
                                        'individualPrice',
                                    ]);
                            },
                        ]);
                },
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
                $priceLadder = PriceProvider::getPriceLadder($sv->id, $store->id, null, null);
                $finalPrice = PriceProvider::getFinalPrice($priceLadder);

                $basePrice = $priceLadder[0]['price'] ?? 0;
                $discountPrice = $priceLadder[0]['discount_price'] ?? null;
                $discountEndsAt = $priceLadder[0]['discount_ends_at'] ?? null;

                $store_stock = $batchStocks[$sv->id] ?? 0;
                $remote_stock = 0;
                if ($store->warehouse) {
                    $remote_stock = ItemStock::where('location_type', \App\Models\Inventory\Warehouse::class)
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

                    'price' => $basePrice,
                    'discount_price' => $discountPrice,
                    'discount_ends_at' => $discountEndsAt,
                    'final_price' => $finalPrice,
                    'active' => (bool) $sv->active,
                    'stock' => $store_stock,
                    'remote_stock' => $remote_stock,
                    'multiplier' => $multiplier,
                    'status' => $sv->active ? 'active' : 'inactive',
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
                        'id' => $sv->individualPrice->id,
                        'price' => $sv->individualPrice->pricing_matrix['price'] ?? null,
                        'discount_price' => $sv->individualPrice->pricing_matrix['discount_price'] ?? null,
                        'discount_ends_at' => $sv->individualPrice->pricing_matrix['discount_ends_at'] ?? null,
                        'active' => (bool) $sv->individualPrice->active,
                    ] : null,
                ];
            })->values();

            $itemVariantIds = $storeVariants->pluck('item_variant_id')->toArray();
            $warehouseStocks = ItemStock::where('location_type', \App\Models\Inventory\Warehouse::class)
                ->whereIn('item_variant_id', $itemVariantIds)
                ->with('location')
                ->get()
                ->groupBy('location_id')
                ->map(function ($stocks) use ($storeVariants) {
                    $loc = $stocks->first()->location;
                    $qtyInPieces = $stocks->reduce(function ($carry, $stock) use ($storeVariants) {
                        $sv = $storeVariants->firstWhere('item_variant_id', $stock->item_variant_id);
                        $mult = $sv ? max(1, $sv->itemVariant->calculateTotalPieces()) : 1;
                        return $carry + ($stock->quantity * $mult);
                    }, 0);
                    return [
                        'id' => $loc->id ?? 0,
                        'name' => $loc->name ?? 'Unknown',
                        'qty' => $qtyInPieces,
                    ];
                })->values()->toArray();

            return [
                'item_id' => $item->id,
                'item_name' => $item->product_name ?? 'Unknown Item',
                'warehouse_stocks' => $warehouseStocks,
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

    public function edit(Store $store)
    {
        return Inertia::render('Admin/Inventory/Stores/Edit', [
            'store' => $store,
        ]);
    }

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

    public function destroy(Store $store)
    {
        $store->delete();

        return redirect()->route('store.index')->with('success', 'Store deleted.');
    }

    // -------------------------------------------------------------------------
    // AJAX endpoints for the variant edit panel
    // -------------------------------------------------------------------------

    public function updateVariant(Request $request, StoreVariant $storeVariant)
    {
        $validated = $request->validate([
            'price' => 'required|numeric|min:0',
            'discount_price' => 'nullable|numeric|min:0',
            'discount_ends_at' => 'nullable|date',
            'active' => 'boolean',
        ]);

        $pricingMatrix = $storeVariant->pricing_matrix ?? [];

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

        $storeVariant->load([
            'customerPrices.customer',
            'sellerPrices.seller',
            'individualPrice',
            'itemVariant' => function ($q) {
                $q->with(['item.category', 'itemColor', 'itemSize', 'itemPackagingType', 'packagingQuantities']);
            },
            'stocks',
        ]);

        $priceLadder = PriceProvider::getPriceLadder($storeVariant->id, $storeVariant->store_id, null, null);
        $basePrice = $priceLadder[0]['price'] ?? 0;
        $discountPrice = $priceLadder[0]['discount_price'] ?? null;
        $discountEndsAt = $priceLadder[0]['discount_ends_at'] ?? null;
        $finalPrice = PriceProvider::getFinalPrice($priceLadder);

        return response()->json([
            'success' => true,
            'variant' => [
                'id' => $storeVariant->id,
                'sku' => $storeVariant->itemVariant->sku ?? '—',
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
                    'id' => $storeVariant->individualPrice->id,
                    'price' => $storeVariant->individualPrice->pricing_matrix['price'] ?? null,
                    'discount_price' => $storeVariant->individualPrice->pricing_matrix['discount_price'] ?? null,
                    'discount_ends_at' => $storeVariant->individualPrice->pricing_matrix['discount_ends_at'] ?? null,
                    'active' => (bool) $storeVariant->individualPrice->active,
                ] : null,
            ],
        ]);
    }

    public function upsertCustomerPrice(Request $request, StoreVariant $storeVariant)
    {
        $validated = $request->validate([
            'customer_id' => 'required|exists:customers,id',
            'customer_type' => 'required|in:business,individual',
            'price' => 'required|numeric|min:0',
            'discount_price' => 'nullable|numeric|min:0',
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
            'price' => (float) $validated['price'],
            'discount_price' => isset($validated['discount_price']) ? (float) $validated['discount_price'] : null,
            'discount_ends_at' => $validated['discount_ends_at'] ?? null,
        ];

        $record = StoreVariantCustomerPrice::updateOrCreate(
            ['store_variant_id' => $storeVariant->id, 'customer_id' => $validated['customer_id']],
            ['pricing_matrix' => $pricingMatrix]
        );

        return response()->json($record->load('customer'));
    }

    public function destroyCustomerPrice(StoreVariantCustomerPrice $price)
    {
        $price->delete();
        return response()->json(['ok' => true]);
    }

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
            'price' => (float) $validated['price'],
            'discount_price' => isset($validated['discount_price']) ? (float) $validated['discount_price'] : null,
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

    public function destroySellerPrice(Request $request, StoreVariantSellerPrice $price)
    {
        $validated = $request->validate([
            'customer_type' => 'required|in:business,individual',
        ]);

        $pricingMatrix = $price->pricing_matrix ?? [];

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

    public function upsertIndividualPrice(Request $request, StoreVariant $storeVariant)
    {
        $validated = $request->validate([
            'price' => 'required|numeric|min:0',
            'discount_price' => 'nullable|numeric|min:0',
            'discount_ends_at' => 'nullable|date',
            'active' => 'boolean',
        ]);

        $businessMatrix = $storeVariant->pricing_matrix ?? [];
        $businessMatrix = isset($businessMatrix[0]) && is_array($businessMatrix[0])
            ? $businessMatrix[0]
            : $businessMatrix;

        $record = StoreVariantIndividualPrice::updateOrCreate(
            ['store_variant_id' => $storeVariant->id],
            [
                'pricing_matrix' => [
                    'price' => (float) $validated['price'],
                    'discount_price' => isset($validated['discount_price']) ? (float) $validated['discount_price'] : null,
                    'discount_ends_at' => $businessMatrix['discount_ends_at'] ?? null,
                    'auto_from_business' => false,
                ],
                'active' => $validated['active'] ?? true,
            ]
        );

        return response()->json([
            'id' => $record->id,
            'price' => $record->pricing_matrix['price'] ?? null,
            'discount_price' => $record->pricing_matrix['discount_price'] ?? null,
            'discount_ends_at' => $record->pricing_matrix['discount_ends_at'] ?? null,
            'active' => (bool) $record->active,
        ]);
    }

    public function destroyIndividualPrice(StoreVariant $storeVariant)
    {
        $storeVariant->individualPrice?->delete();
        return response()->json(['ok' => true]);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVENTORY SUB-PAGES
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * GET /stores/{store}/inventory/replenish
     */
    public function replenish(Store $store)
    {
        $transfers = Transfer::with([
                'fromLocation:id,name',
                'toLocation:id,name',
                'fromStore:id,name',
                'toStore:id,name',
                'storeVariant.itemVariant.itemColor',
                'storeVariant.itemVariant.itemSize',
                'storeVariant.itemVariant.itemPackagingType',
            ])
            ->where(function ($q) use ($store) {
                $q->where('to_store_id', $store->id)
                    ->orWhereIn('store_variant_id', function ($sq) use ($store) {
                        $sq->select('id')->from('store_variants')->where('store_id', $store->id);
                    });
            })
            ->orderByDesc('created_at')
            ->get()
            ->map(fn(Transfer $t) => $this->mapTransferRow($t));

        $openVariantIds = Transfer::whereIn('status', ['pending', 'in_transit'])
            ->whereIn('store_variant_id', function ($sq) use ($store) {
                $sq->select('id')->from('store_variants')->where('store_id', $store->id);
            })
            ->pluck('store_variant_id')
            ->filter()
            ->unique()
            ->all();

        $queued = $store->storeVariants()
            ->whereNotIn('id', $openVariantIds ?: [0])
            ->with(['itemVariant.itemColor', 'itemVariant.itemSize', 'itemVariant.itemPackagingType'])
            ->get()
            ->map(function (StoreVariant $sv) {
                $iv = $sv->itemVariant;
                $piecesPerUnit = max(1, (int) ($iv?->calculateTotalPieces() ?: 1));
                $perCarton = $piecesPerUnit * 10;
                $minReorder = $perCarton * 2;

                if ((int) $sv->stock >= $minReorder) {
                    return null;
                }

                $label = implode(' / ', array_filter([
                    $iv?->itemColor?->name,
                    $iv?->itemSize?->name,
                    $iv?->itemPackagingType?->name,
                ])) ?: ($iv?->sku ?? '—');

                return [
                    'id' => 0,
                    'reference' => 'AUTO-' . $sv->id,
                    'status' => 'queued',
                    'variant' => [
                        'id' => $sv->id,
                        'sku' => $iv?->sku ?? '—',
                        'label' => $label,
                        'multiplier' => $piecesPerUnit,
                    ],
                    'qty' => $perCarton,
                    'cartons' => 1,
                    'source' => 'Auto',
                    'destination' => 'Store',
                    'requested_at' => now()->toIso8601String(),
                    'eta' => null,
                    'completed_at' => null,
                    'note' => 'Auto-queued — below reorder threshold',
                ];
            })
            ->filter()
            ->values();

        return Inertia::render('Admin/Inventory/Stores/Replenish', [
            'store' => [
                'id' => $store->id,
                'name' => $store->name,
                'location' => $store->location,
                'status' => $store->status,
            ],
            'transfers' => $transfers->concat($queued)->values(),
        ]);
    }

    /** Serialize a real Transfer for the frontend. */
    private function mapTransferRow(Transfer $t): array
    {
        $sv = $t->storeVariant;
        $iv = $sv?->itemVariant;

        $piecesPerUnit = max(1, (int) ($iv?->calculateTotalPieces() ?: 1));
        $perCarton = $piecesPerUnit * 10;

        $label = implode(' / ', array_filter([
            $iv?->itemColor?->name,
            $iv?->itemSize?->name,
            $iv?->itemPackagingType?->name,
        ])) ?: ($iv?->sku ?? '—');

        $sourceLabel = $t->fromLocation?->name ?? $t->fromStore?->name ?? 'Warehouse';
        $destLabel = $t->toLocation?->name ?? $t->toStore?->name ?? 'Store';

        return [
            'id' => $t->id,
            'reference' => $t->reference,
            'status' => $t->ui_status,
            'variant' => [
                'id' => $sv?->id,
                'sku' => $iv?->sku ?? '—',
                'label' => $label,
                'multiplier' => $piecesPerUnit,
            ],
            'qty' => (int) $t->quantity,
            'cartons' => (int) ceil($t->quantity / $perCarton),
            'source' => $sourceLabel,
            'destination' => $destLabel,
            'requested_at' => optional($t->created_at)->toIso8601String(),
            'eta' => optional($t->eta)->toIso8601String(),
            'completed_at' => optional($t->completed_at)->toIso8601String(),
            'note' => $t->notes,
        ];
    }

    /**
     * GET /stores/{store}/inventory/deviations
     */
    public function deviations(Store $store)
    {
        $storeVariantIds = StoreVariant::where('store_id', $store->id)->pluck('id');

        if ($storeVariantIds->isEmpty()) {
            return Inertia::render('Admin/Inventory/Stores/PriceDeviations', [
                'store' => [
                    'id' => $store->id,
                    'name' => $store->name,
                    'location' => $store->location,
                    'status' => $store->status,
                ],
                'deviations' => [],
            ]);
        }

        $rows = collect();

        $variantMap = StoreVariant::whereIn('id', $storeVariantIds)
            ->with(['itemVariant.itemColor', 'itemVariant.itemSize', 'itemVariant.itemPackagingType'])
            ->get()
            ->mapWithKeys(function (StoreVariant $sv) {
                $iv = $sv->itemVariant;
                $label = implode(' / ', array_filter([
                    $iv?->itemColor?->name,
                    $iv?->itemSize?->name,
                    $iv?->itemPackagingType?->name,
                ])) ?: ($iv?->sku ?? '—');

                return [
                    $sv->id => [
                        'id' => $sv->id,
                        'sku' => $iv?->sku ?? '—',
                        'label' => $label,
                        'multiplier' => max(1, (int) ($iv?->calculateTotalPieces() ?: 1)),
                    ],
                ];
            });

        $push = function (int $svId, string $tier, ?string $subject, ?array $matrix, int $rowId) use (&$rows, $variantMap) {
            if (!$matrix) {
                return;
            }
            $discount = $matrix['discount_price'] ?? null;
            $endsAt = $matrix['discount_ends_at'] ?? null;
            if ($discount == null || $endsAt == null) {
                return;
            }

            $end = Carbon::parse($endsAt);
            if ($end->gt(now()->addDays(30))) {
                return;
            }
            if (!isset($variantMap[$svId])) {
                return;
            }

            $rows->push([
                'id' => $rowId,
                'variant' => $variantMap[$svId],
                'tier' => $tier,
                'subject' => $subject,
                'price' => (float) ($matrix['price'] ?? 0),
                'discount_price' => (float) $discount,
                'discount_ends_at' => $end->toIso8601String(),
                'days_left' => (int) now()->diffInDays($end, false),
            ]);
        };

        // B2B — store variant base pricing matrix
        StoreVariant::whereIn('id', $storeVariantIds)->get()->each(function (StoreVariant $sv) use ($push) {
            $m = $sv->pricing_matrix ?? [];
            if (isset($m[0]) && is_array($m[0])) {
                $m = $m[0];
            }
            $push($sv->id, 'b2b', 'Business default', $m, $sv->id);
        });

        // Individual
        StoreVariantIndividualPrice::whereIn('store_variant_id', $storeVariantIds)
            ->get()
            ->each(fn($ip) => $push(
                $ip->store_variant_id,
                'individual',
                'Individual default',
                $ip->pricing_matrix ?? [],
                $ip->id
            ));

        // Customer
        StoreVariantCustomerPrice::whereIn('store_variant_id', $storeVariantIds)
            ->with('customer')
            ->get()
            ->each(function ($cp) use ($push) {
                $name = $cp->customer
                    ? trim($cp->customer->first_name . ' ' . ($cp->customer->last_name ?? ''))
                    : "Customer #{$cp->customer_id}";
                $push($cp->store_variant_id, 'customer', $name, $cp->pricing_matrix ?? [], $cp->id);
            });

        // Seller
        StoreVariantSellerPrice::whereIn('store_variant_id', $storeVariantIds)
            ->with('seller')
            ->get()
            ->each(function ($sp) use ($push) {
                $name = $sp->seller
                    ? trim(($sp->seller->first_name ?? '') . ' ' . ($sp->seller->last_name ?? ''))
                    : "Seller #{$sp->seller_id}";
                $m = $sp->pricing_matrix ?? [];

                if (isset($m['business'])) {
                    $push($sp->store_variant_id, 'seller', $name . ' (B2B)', $m['business'], $sp->id);
                }
                if (isset($m['individual'])) {
                    $push($sp->store_variant_id, 'seller', $name . ' (Individual)', $m['individual'], $sp->id);
                }
                if (!isset($m['business']) && !isset($m['individual'])) {
                    $push($sp->store_variant_id, 'seller', $name, $m, $sp->id);
                }
            });

        return Inertia::render('Admin/Inventory/Stores/PriceDeviations', [
            'store' => [
                'id' => $store->id,
                'name' => $store->name,
                'location' => $store->location,
                'status' => $store->status,
            ],
            'deviations' => $rows->sortBy('days_left')->values(),
        ]);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TRANSFER ACTIONS
    // ═════════════════════════════════════════════════════════════════════════

    public function cancelTransfer(Transfer $transfer)
    {
        abort_unless(
            in_array($transfer->status, ['pending', 'in_transit'], true),
            422,
            'Only pending or in-transit transfers can be cancelled.'
        );

        $transfer->update([
            'status' => 'cancelled',
            'cancelled_at' => now(),
            'cancelled_by' => auth()->id(),
        ]);

        return back();
    }

    public function dispatchTransfer(Transfer $transfer)
    {
        abort_unless($transfer->status === 'pending', 422, 'Only pending transfers can be dispatched.');

        $transfer->update([
            'status' => 'in_transit',
            'dispatched_at' => now(),
            'eta' => now()->addHours(24),
        ]);

        return back();
    }

    public function receiveTransfer(Transfer $transfer)
    {
        abort_unless($transfer->status === 'in_transit', 422, 'Only in-transit transfers can be received.');

        \DB::transaction(function () use ($transfer) {
            $transfer->update([
                'status' => 'completed',
                'completed_at' => now(),
            ]);

            if ($transfer->storeVariant) {
                $transfer->storeVariant()->increment('stock', $transfer->quantity);
            }

            if ($transfer->from_location_id && $transfer->item_variant_id) {
                ItemStock::where([
                    'item_variant_id' => $transfer->item_variant_id,
                    'location_type' => ItemInventoryLocation::class,
                    'location_id' => $transfer->from_location_id,
                ])->decrement('quantity', $transfer->quantity);
            }

            $storeId = $transfer->storeVariant?->store_id ?? $transfer->to_store_id;
            if ($storeId && $transfer->item_variant_id) {
                ItemStock::firstOrCreate(
                    [
                        'location_type' => Store::class,
                        'location_id' => $storeId,
                        'item_variant_id' => $transfer->item_variant_id,
                    ],
                    ['quantity' => 0]
                )->increment('quantity', $transfer->quantity);
            }
        });

        return back();
    }

    /**
     * POST /stores/{store}/transfers
     */
    public function storeTransfer(Request $request, Store $store)
    {
        $validated = $request->validate([
            'store_variant_id' => 'required|exists:store_variants,id',
            'quantity' => 'required|integer|min:1',
            'from_location_id' => 'required|exists:item_inventory_locations,id',
            'notes' => 'nullable|string|max:500',
        ]);

        $sv = StoreVariant::findOrFail($validated['store_variant_id']);

        $reference = 'TR-' . str_pad((Transfer::max('id') ?? 0) + 1, 6, '0', STR_PAD_LEFT);

        Transfer::create([
            'reference' => $reference,
            'item_variant_id' => $sv->item_variant_id,
            'store_variant_id' => $sv->id,
            'to_store_id' => $store->id,
            'from_location_id' => $validated['from_location_id'],
            'to_location_id' => $validated['from_location_id'],
            'quantity' => $validated['quantity'],
            'status' => 'pending',
            'initiated_by' => auth()->id(),
            'notes' => $validated['notes'] ?? null,
        ]);

        return back();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PRICE OVERRIDE ACTIONS
    // ═════════════════════════════════════════════════════════════════════════

    public function updateOverride(Request $request, string $source, int $id)
    {
        $validated = $request->validate([
            'discount_price' => ['nullable', 'numeric', 'min:0'],
            'discount_ends_at' => ['nullable', 'date'],
        ]);

        if ($source === 'b2b') {
            $sv = StoreVariant::findOrFail($id);
            $m = $sv->pricing_matrix ?? [];
            if (isset($m[0]) && is_array($m[0])) {
                $m[0]['discount_price'] = $validated['discount_price'];
                $m[0]['discount_ends_at'] = $validated['discount_ends_at'];
            } else {
                $m['discount_price'] = $validated['discount_price'];
                $m['discount_ends_at'] = $validated['discount_ends_at'];
            }
            $sv->update(['pricing_matrix' => $m]);

        } elseif ($source === 'individual') {
            $rec = StoreVariantIndividualPrice::findOrFail($id);
            $m = $rec->pricing_matrix ?? [];
            $m['discount_price'] = $validated['discount_price'];
            $m['discount_ends_at'] = $validated['discount_ends_at'];
            $rec->update(['pricing_matrix' => $m]);

        } elseif ($source === 'customer') {
            $rec = StoreVariantCustomerPrice::findOrFail($id);
            $m = $rec->pricing_matrix ?? [];
            $m['discount_price'] = $validated['discount_price'];
            $m['discount_ends_at'] = $validated['discount_ends_at'];
            $rec->update(['pricing_matrix' => $m]);

        } elseif ($source === 'seller') {
            $rec = StoreVariantSellerPrice::findOrFail($id);
            $m = $rec->pricing_matrix ?? [];
            if (isset($m['business'])) {
                $m['business']['discount_price'] = $validated['discount_price'];
                $m['business']['discount_ends_at'] = $validated['discount_ends_at'];
            }
            if (isset($m['individual'])) {
                $m['individual']['discount_price'] = $validated['discount_price'];
                $m['individual']['discount_ends_at'] = $validated['discount_ends_at'];
            }
            if (!isset($m['business']) && !isset($m['individual'])) {
                $m['discount_price'] = $validated['discount_price'];
                $m['discount_ends_at'] = $validated['discount_ends_at'];
            }
            $rec->update(['pricing_matrix' => $m]);
        } else {
            abort(422, 'Unknown source.');
        }

        return back();
    }

    public function destroyOverride(string $source, int $id)
    {
        match ($source) {
            'b2b' => $this->clearB2bDiscount($id),
            'individual' => $this->clearMatrixDiscount(StoreVariantIndividualPrice::findOrFail($id)),
            'customer' => StoreVariantCustomerPrice::findOrFail($id)->delete(),
            'seller' => $this->clearSellerDiscount($id),
            default => abort(422, 'Unknown source.'),
        };

        return back();
    }

    private function clearB2bDiscount(int $id): void
    {
        $sv = StoreVariant::findOrFail($id);
        $m = $sv->pricing_matrix ?? [];
        if (isset($m[0]) && is_array($m[0])) {
            $m[0]['discount_price'] = null;
            $m[0]['discount_ends_at'] = null;
        } else {
            $m['discount_price'] = null;
            $m['discount_ends_at'] = null;
        }
        $sv->update(['pricing_matrix' => $m]);
    }

    private function clearMatrixDiscount($rec): void
    {
        $m = $rec->pricing_matrix ?? [];
        $m['discount_price'] = null;
        $m['discount_ends_at'] = null;
        $rec->update(['pricing_matrix' => $m]);
    }

    private function clearSellerDiscount(int $id): void
    {
        $rec = StoreVariantSellerPrice::findOrFail($id);
        $m = $rec->pricing_matrix ?? [];
        if (isset($m['business'])) {
            $m['business']['discount_price'] = null;
            $m['business']['discount_ends_at'] = null;
        }
        if (isset($m['individual'])) {
            $m['individual']['discount_price'] = null;
            $m['individual']['discount_ends_at'] = null;
        }
        if (!isset($m['business']) && !isset($m['individual'])) {
            $m['discount_price'] = null;
            $m['discount_ends_at'] = null;
        }
        $rec->update(['pricing_matrix' => $m]);
    }
}