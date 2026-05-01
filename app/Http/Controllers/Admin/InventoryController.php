<?php

namespace App\Http\Controllers\Admin; // Moved from Admin\Inventory

use App\Http\Controllers\Controller;
use App\Models\Store\Store;
use Inertia\Inertia;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    public function index()
    {
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

    public function show($id)
    {
        // Finding the store and items similar to how you find a cart
        $store = Store::findOrFail($id);

        // Map the inventory items to match your React 'InventoryItem' interface
        $inventory = $store->items()
            ->with(['category', 'variants'])
            ->paginate(15)
            ->through(function ($item) {
                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'category' => [
                        'name' => $item->category->name ?? 'Uncategorized'
                    ],
                    'variants' => $item->variants->map(fn($v) => [
                        'id' => $v->id,
                        'name' => $v->name,
                        'sku' => $v->sku,
                        'stock' => $v->pivot->quantity ?? 0,
                    ]),
                    'total_stock' => $item->variants->sum('pivot.quantity'),
                    'status' => $item->total_stock > 10 ? 'in_stock' : 'low_stock',
                ];
            });

        return Inertia::render('Admin/Inventory/Show', [
            'store' => [
                'id' => $store->id,
                'name' => $store->name,
            ],
            'inventory' => $inventory
        ]);
    }
}
