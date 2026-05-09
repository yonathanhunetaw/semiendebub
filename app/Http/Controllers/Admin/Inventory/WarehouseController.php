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
        // 1. Get Warehouses and map the data
        $warehouses = Warehouse::with('store')
            ->withCount('stocks')
            ->withSum('stocks as total_units', 'quantity')
            ->orderBy('name')
            ->get()
            ->map(function ($wh) {
                return [
                    'id' => $wh->id,
                    'name' => $wh->name,
                    'address' => $wh->address,
                    'code' => $wh->code,
                    'store_name' => $wh->store?->name,
                    'stocks_count' => $wh->stocks_count,
                    'total_units' => (int) $wh->total_units,
                ];
            });

        // 2. Get Stock across ALL warehouses
        $stockLines = ItemStock::where('location_type', Warehouse::class)
            ->with([
                'itemVariant.item',
                'itemVariant.itemColor',
                'itemVariant.itemSize',
                'location'
            ])
            ->get()
            ->map(fn($stock) => [
                'id' => $stock->id,
                'item_name' => $stock->itemVariant->item->product_name,
                'sku' => $stock->itemVariant->sku,
                'variant_label' => collect([
                    $stock->itemVariant->itemColor?->name,
                    $stock->itemVariant->itemSize?->name,
                ])->filter()->join(' / ') ?: 'Standard',
                'location_name' => $stock->location->name,
                'quantity' => $stock->quantity,
                'min_stock_level' => $stock->min_stock_level, // Pass this for the progress bar
                'is_low' => $stock->quantity <= $stock->min_stock_level,
            ]);

        // 3. FIX: Assign the variables by calculating from the collections
        $totalUnits = $stockLines->sum('quantity');
        $lowStockCount = $stockLines->where('is_low', true)->count();

        return Inertia::render('Admin/Inventory/Warehouse/index', [
            'warehouses' => $warehouses,
            'totalWarehouses' => $warehouses->count(),
            'totalUnits' => $totalUnits,
            'lowStockCount' => $lowStockCount,
            'stockLines' => $stockLines,
        ]);
    }
}
