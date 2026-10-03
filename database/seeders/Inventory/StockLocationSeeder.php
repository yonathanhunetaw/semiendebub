<?php

declare(strict_types=1);

namespace Database\Seeders\Inventory;

use App\Models\Store\Store;
use App\Services\Inventory\StockLocationTree;
use Illuminate\Database\Seeder;

/**
 * The parts of the stock_locations tree nothing derives.
 *
 * At runtime Store, Warehouse and ItemInventoryLocation keep their nodes in
 * step through model events, but seeding runs with events off, so the whole
 * tree is synced here — before StockLedgerSeeder books any stock. A Remote Hub
 * is never created automatically, so the one the business has — Main Store's —
 * is added here too. It starts empty.
 */
class StockLocationSeeder extends Seeder
{
    public function run(StockLocationTree $tree): void
    {
        // Model events are off while seeding, so the tree is built here
        // rather than by Store/Warehouse/ItemInventoryLocation events.
        $nodes = $tree->syncAll();
        $this->command?->info("Location tree: {$nodes} nodes.");

        $store = Store::query()->where('name', 'Main Store')->first();

        if ($store !== null) {
            $hub = $tree->addRemoteHub($store);
            $this->command?->info("Remote hub ready: {$hub->name}.");
        }
    }
}
