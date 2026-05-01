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
        // Consistent with your previous ERP dashboard aesthetic
        $stores = Store::withCount('items')->get()->map(function ($store) {
            return [
                'id' => $store->id,
                'name' => $store->name,
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
        $store = Store::findOrFail($id);

        // Load items with their relationships specifically for the table view
        $inventory = $store->items()
            ->with(['category', 'variants']) // These must be eager loaded for the frontend
            ->paginate(15)
            ->through(fn ($item) => [
                'id' => $item->id,
                'name' => $item->name,
                'category' => [
                    'name' => $item->category->name ?? 'Uncategorized'
                ],
                'variants' => $item->variants->map(fn ($v) => [
                    'id' => $v->id,
                    'name' => $v->name,
                    'sku' => $v->sku,
                    'stock' => $v->pivot->quantity ?? 0, // Pivot data is vital for ERP stock
                ]),
                'total_stock' => $item->variants->sum('pivot.quantity'),
                'status' => $item->status ?? 'in_stock',
            ]);

        return Inertia::render('Admin/Inventory/Show', [
            'store' => [
                'id' => $store->id,
                'name' => $store->name,
            ],
            'inventory' => $inventory
        ]);
    }
}
