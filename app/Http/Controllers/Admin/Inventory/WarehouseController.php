<?php
namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\ItemStock; // Adjust to your actual namespace
use Inertia\Inertia;

class WarehouseController extends Controller
{
    public function index()
    {
        // 1. Get Warehouses only (Central Hubs)
        $warehouses = Warehouse::withCount('stocks')
            ->withSum('stocks as total_units', 'quantity')
            ->orderBy('name')
            ->get();

        // 2. Get Stock across ALL warehouses
        // We filter location_type to only see Warehouse stock here
        $stockLines = ItemStock::where('location_type', Warehouse::class)
            ->with([
                'itemVariant.item',
                'itemVariant.itemColor',
                'itemVariant.itemSize',
                'location' // This is the Warehouse
            ])
            ->get()
            ->map(fn ($stock) => [
                'id'            => $stock->id,
                'item_name'     => $stock->itemVariant->item->product_name,
                'sku'           => $stock->itemVariant->sku,
                'variant_label' => collect([
                    $stock->itemVariant->itemColor?->name,
                    $stock->itemVariant->itemSize?->name,
                ])->filter()->join(' / ') ?: 'Standard',
                'location_name' => $stock->location->name, // Warehouse Name
                'quantity'      => $stock->quantity,
                'is_low'        => $stock->quantity <= $stock->min_stock_level,
            ]);

        return Inertia::render('Admin/Inventory/Warehouse/Index', [
            'warehouses'    => $warehouses,
            'stockLines'    => $stockLines,
            'totalUnits'    => $stockLines->sum('quantity'),
            'lowStockCount' => $stockLines->where('is_low', true)->count(),
        ]);
    }
}
