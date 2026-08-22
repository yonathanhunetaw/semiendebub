<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

try {
    $warehouses = App\Models\Inventory\Warehouse::with('store')->withCount('stocks')->withSum('stocks as total_units', 'quantity')->orderBy('name')->get();
    echo "Warehouses OK.\n";
    
    $stockLines = App\Models\StockKeeper\ItemStock::whereHasMorph('location', [App\Models\Inventory\Warehouse::class])
            ->with([
                'itemVariant.item',
                'itemVariant.itemColor',
                'itemVariant.itemSize',
                'location'
            ])
            ->get();
    echo "StockLines OK.\n";
} catch (\Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
