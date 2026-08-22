<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$warehouses = App\Models\Inventory\Warehouse::all();
echo "Raw Warehouse Count: " . $warehouses->count() . "\n";
print_r($warehouses->toArray());

echo "\nNow testing withSum query:\n";
try {
    $warehousesWithSum = App\Models\Inventory\Warehouse::with('store')
            ->withCount('stocks')
            ->withSum('stocks as total_units', 'quantity')
            ->orderBy('name')
            ->get();
    echo "Query successful. Count: " . $warehousesWithSum->count() . "\n";
} catch (\Exception $e) {
    echo "Query Error: " . $e->getMessage() . "\n";
}
