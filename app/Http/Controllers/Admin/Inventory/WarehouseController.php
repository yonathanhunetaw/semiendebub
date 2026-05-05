<?php

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Models\ItemInventoryLocation;
use App\Models\Store\StoreVariant;
use Inertia\Inertia;

class WarehouseController extends Controller
{
    public function index()
    {
        // All inventory locations with their linked store name + stock counts
        $locations = ItemInventoryLocation::with('store')
            ->withCount('stockLines')
            ->withSum('stockLines', 'quantity')
            ->orderBy('name')
            ->get()
            ->map(fn ($loc) => [
                'id'                => $loc->id,
                'name'              => $loc->name,
                'address'           => $loc->address,
                'store_id'          => $loc->store_id,
                'store_name'        => $loc->store?->name,
                'stock_lines_count' => $loc->stock_lines_count,
                'total_units'       => (int) $loc->stock_lines_sum_quantity,
            ]);

        // Stock lines: one row per variant per location
        // Adjust the model/relation names to match your actual StockLine model
        $stockLines = \App\Models\StockLine::with([
            'variant.item',
            'variant.itemColor',
            'variant.itemSize',
            'location',
        ])
        ->orderBy('quantity')
        ->get()
        ->map(fn ($line) => [
            'id'                  => $line->id,
            'item_name'           => $line->variant->item->product_name,
            'variant_label'       => collect([
                $line->variant->itemColor?->name,
                $line->variant->itemSize?->name,
            ])->filter()->join(' / ') ?: 'Default',
            'sku'                 => $line->variant->sku,
            'location_name'       => $line->location->name,
            'quantity'            => $line->quantity,
            'low_stock_threshold' => $line->low_stock_threshold,
        ]);

        $totalUnits    = $stockLines->sum('quantity');
        $lowStockCount = $stockLines->filter(
            fn ($l) => $l['low_stock_threshold'] !== null && $l['quantity'] <= $l['low_stock_threshold']
        )->count();

        return Inertia::render('Admin/Inventory/Warehouse/index', [
            'locations'      => $locations,
            'stockLines'     => $stockLines,
            'totalLocations' => $locations->count(),
            'totalUnits'     => $totalUnits,
            'lowStockCount'  => $lowStockCount,
        ]);
    }

    // Add create/store/edit/update/destroy for locations as needed
}
