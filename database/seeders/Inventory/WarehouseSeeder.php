<?php

namespace Database\Seeders\Inventory;

use App\Models\Inventory\Warehouse;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use Illuminate\Database\Seeder;

class WarehouseSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Create a couple of Warehouses
        $mainWh = Warehouse::updateOrCreate(
            ['code' => 'WH-MAIN-01'],
            [
                'name' => 'Main Distribution Hub',
                'address' => '123 Industrial Way, Nairobi',
                'store_id' => Store::first()?->id, // Optional: link to a primary store
            ]
        );

        $northWh = Warehouse::updateOrCreate(
            ['code' => 'WH-NORTH-02'],
            [
                'name' => 'North Valley Annex',
                'address' => '45 Logistics Lane, Thika',
                'store_id' => null,
            ]
        );

        // 2. Get some Item Variants to put in stock
        $variants = ItemVariant::take(10)->get();

        foreach ($variants as $variant) {
            // Seed stock for Main Warehouse
            ItemStock::create([
                'item_variant_id' => $variant->id,
                'location_id'     => $mainWh->id,
                'location_type'   => Warehouse::class,
                'quantity'        => rand(50, 200),
                'min_stock_level' => 20,
            ]);

            // Seed stock for North Warehouse (Low stock example)
            ItemStock::create([
                'item_variant_id' => $variant->id,
                'location_id'     => $northWh->id,
                'location_type'   => Warehouse::class,
                'quantity'        => rand(5, 15), // This will trigger the "Low Stock" badge
                'min_stock_level' => 20,
            ]);
        }
    }
}
