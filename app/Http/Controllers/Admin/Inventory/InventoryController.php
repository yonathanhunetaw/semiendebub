<?php

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Models\Store\Store;
use Inertia\Inertia;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    /**
     * Display the Inventory Hub (Store Selection).
     */
    public function index()
    {
        // Fetch stores and count associated items via your item_store pivot table
        $stores = Store::withCount('items')->get()->map(function ($store) {
            return [
                'id' => $store->id,
                'name' => $store->name,
                // Using the 'type' and 'code' if they exist in your stores table
                'type' => $store->type ?? 'retail',
                'location_code' => $store->location_code ?? 'LOC-' . $store->id,
                'items_count' => $store->items_count,
            ];
        });

        return Inertia::render('Admin/Inventory/Index', [
            'stores' => $stores
        ]);
    }

    /**
     * Display inventory for a specific store.
     */
    public function show($id)
    {
        $store = Store::with(['items.category', 'items.variants'])->findOrFail($id);

        return Inertia::render('Admin/Inventory/Show', [
            'store' => [
                'id' => $store->id,
                'name' => $store->name,
            ],
            'inventory' => $store->items()->paginate(15)
        ]);
    }
}
