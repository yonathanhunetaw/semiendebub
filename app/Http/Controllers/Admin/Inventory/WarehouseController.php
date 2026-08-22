<?php
namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Models\Inventory\Warehouse;
use App\Models\Inventory\ItemStock;
use App\Models\Store\Store;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\Log;

class WarehouseController extends Controller
{
    public function index()
    {
        Log::info('Viewing warehouse index page.');

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
            })->toArray();

        $stockLines = ItemStock::whereHasMorph('location', [Warehouse::class])
            ->with([
                'itemVariant.item',
                'itemVariant.itemColor',
                'itemVariant.itemSize',
                'location'
            ])
            ->get()
            ->map(function ($stock) {
                $itemVariant = $stock->itemVariant;

                return [
                    'id' => $stock->id,
                    'item_name' => $itemVariant?->item?->product_name ?? 'Unknown',
                    'sku' => $itemVariant?->sku,
                    'variant_label' => collect([
                        $itemVariant?->itemColor?->name,
                        $itemVariant?->itemSize?->name,
                    ])->filter()->join(' / ') ?: 'Standard',
                    'location_name' => $stock->location?->name ?? 'Unknown',
                    'quantity' => $stock->quantity,
                    'min_stock_level' => $stock->min_stock_level,
                    'is_low' => $stock->min_stock_level !== null && $stock->quantity <= $stock->min_stock_level,
                ];
            })->values();

        $totalUnits = $stockLines->sum('quantity');
        $lowStockCount = $stockLines->where('is_low', true)->count();

        return Inertia::render('Admin/Inventory/Warehouse/index', [
            'warehouses' => $warehouses,
            'totalWarehouses' => count($warehouses),
            'totalUnits' => $totalUnits,
            'lowStockCount' => $lowStockCount,
            'stockLines' => $stockLines,
        ]);
    }

    public function create()
    {
        Log::info('Viewing warehouse create page.');

        $stores = Store::select('id', 'name')->orderBy('name')->get();

        return Inertia::render('Admin/Inventory/Warehouse/Create', [
            'stores' => $stores
        ]);
    }

    public function store(Request $request)
    {
        Log::info('Attempting to create a new warehouse', ['request_data' => $request->all()]);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:255|unique:warehouses,code',
            'address' => 'nullable|string|max:500',
            'store_id' => 'nullable|exists:stores,id',
            'manager' => 'nullable|string|max:255',
            'status' => 'required|in:active,inactive',
        ]);

        $warehouse = Warehouse::create($validated);

        Log::info('Warehouse created successfully', ['warehouse_id' => $warehouse->id]);

        return redirect()->route('admin.inventory.warehouse.index')->with('success', 'Warehouse created successfully.');
    }

    public function edit(Warehouse $warehouse)
    {
        Log::info('Viewing warehouse edit page.', ['warehouse_id' => $warehouse->id]);

        $stores = Store::select('id', 'name')->orderBy('name')->get();

        return Inertia::render('Admin/Inventory/Warehouse/Edit', [
            'warehouse' => $warehouse,
            'stores' => $stores
        ]);
    }

    public function update(Request $request, Warehouse $warehouse)
    {
        Log::info('Attempting to update warehouse', ['warehouse_id' => $warehouse->id, 'request_data' => $request->all()]);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:255|unique:warehouses,code,' . $warehouse->id,
            'address' => 'nullable|string|max:500',
            'store_id' => 'nullable|exists:stores,id',
            'manager' => 'nullable|string|max:255',
            'status' => 'required|in:active,inactive',
        ]);

        $warehouse->update($validated);

        Log::info('Warehouse updated successfully', ['warehouse_id' => $warehouse->id]);

        return redirect()->route('admin.inventory.warehouse.index')->with('success', 'Warehouse updated successfully.');
    }

    public function destroy(Warehouse $warehouse)
    {
        Log::info('Attempting to delete warehouse', ['warehouse_id' => $warehouse->id]);

        $warehouse->delete();

        Log::info('Warehouse deleted successfully', ['warehouse_id' => $warehouse->id]);

        return redirect()->route('admin.inventory.warehouse.index')->with('success', 'Warehouse deleted successfully.');
    }
}
