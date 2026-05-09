<?php

namespace App\Http\Controllers\Admin\Store;

use App\Http\Controllers\Controller;
use App\Models\Store\Store;
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
                'id' => $s->id,
                'name' => $s->name,
                'location' => $s->location,
                'manager' => $s->manager,
                'status' => $s->status,
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
    public function show(Store $store)
    {
        // Load relationships: Store -> StoreVariants -> ItemVariant -> Item
        $store->load(['storeVariants.itemVariant.item', 'storeVariants.stocks']);

        // Group the store variants by the parent Item
        $inventory = $store->storeVariants->groupBy(function ($sv) {
            return $sv->itemVariant->item_id;
        })->map(function ($variants, $itemId) {
            $firstVariant = $variants->first();
            $item = $firstVariant->itemVariant->item;

            return [
                'item_id' => $itemId,
                'item_name' => $item->name ?? 'Unknown Item',
                'category' => $item->category->name ?? 'N/A',
                'total_variants' => $variants->count(),
                'total_stock' => $variants->reduce(function ($carry, $sv) {
                    return $carry + $sv->stocks->sum('quantity');
                }, 0),
                // Pass the individual variants for the expanded view
                'variants' => $variants->map(fn($sv) => [
                    'id' => $sv->id,
                    'sku' => $sv->itemVariant->sku,
                    'price' => $sv->price,
                    'stock' => $sv->stocks->sum('quantity'),
                    'status' => $sv->status,
                ])->values(),
            ];
        })->values();

        return Inertia::render('Admin/Inventory/Stores/Show', [
            'store' => $store,
            'inventory' => $inventory,
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
}
