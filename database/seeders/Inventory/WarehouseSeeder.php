<?php

namespace Database\Seeders\Inventory;

use App\Models\Inventory\Warehouse;
use App\Models\Store\Store;
use Illuminate\Database\Seeder;

/**
 * The off-site warehouse units, and nothing else.
 *
 * It used to stock them too — ten variants, picked with `take(10)`, at whatever
 * quantity regardless of whether the variant was a carton or a loose piece. Stock
 * now has one owner, Database\Seeders\Inventory\StockLedgerSeeder, which fills
 * every warehouse with bulk units.
 */
class WarehouseSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Create a couple of Warehouses
        $mainWh = Warehouse::updateOrCreate(
            ['code' => 'WH-MAIN-01'],
            [
                'name' => 'Main Distribution Hub A',
                'address' => '123 Industrial Way, Nairobi',
                'store_id' => Store::first()?->id, // Optional: link to a primary store
            ]
        );

        $northWh = Warehouse::updateOrCreate(
            ['code' => 'WH-NORTH-02'],
            [
                'name' => 'Main Distribution Hub B',
                'address' => '45 Logistics Lane, Thika',
                'store_id' => null,
            ]
        );

        $this->command?->info("Warehouses ready: {$mainWh->name}, {$northWh->name}.");
    }
}
