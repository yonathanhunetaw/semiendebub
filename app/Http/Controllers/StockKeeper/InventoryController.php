<?php

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Inventory\Warehouse;
use App\Models\Inventory\ItemStock;
use Illuminate\Http\Request;
use Inertia\Inertia;

class InventoryController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $items = Item::all();
        $warehouses = Warehouse::all();
        $variants = ItemVariant::with('item', 'itemColor', 'itemSize')->get()->map(function ($v) {
            $label = collect([$v->itemColor?->name, $v->itemSize?->name])->filter()->join(' / ') ?: 'Standard';
            return [
                'id' => $v->id,
                'name' => ($v->item->product_name ?? 'Unknown') . ' - ' . $label . ' (SKU: ' . $v->sku . ')',
            ];
        });

        return Inertia::render('StockKeeper/Inventory/index', [
            'items' => $items,
            'warehouses' => $warehouses,
            'variants' => $variants,
        ]);
    }

    /**
     * Receive stock into a warehouse.
     */
    public function receive(Request $request)
    {
        $validated = $request->validate([
            'warehouse_id' => 'required|exists:warehouses,id',
            'item_variant_id' => 'required|exists:item_variants,id',
            'quantity' => 'required|integer|min:1',
        ]);

        $stock = ItemStock::firstOrCreate(
            [
                'location_id' => $validated['warehouse_id'],
                'location_type' => Warehouse::class,
                'item_variant_id' => $validated['item_variant_id'],
            ],
            [
                'quantity' => 0,
            ]
        );

        $stock->increment('quantity', $validated['quantity']);

        return back()->with('success', 'Stock received successfully in warehouse.');
    }
}
