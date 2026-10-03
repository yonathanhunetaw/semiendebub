<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Store\Store;
use Illuminate\Database\Seeder;

/**
 * The facility network a shipment can route between.
 *
 * Existing rows are retail outlets. This adds the warehouse-type facilities so a
 * shipment has two structural nodes to run between.
 *
 * Stocking them is not its job: `item_stocks` has one owner,
 * Database\Seeders\Inventory\StockLedgerSeeder, which fills every warehouse —
 * these facilities included — with bulk units. This seeder used to stock 40
 * random SKUs at whatever quantity, so a hub's holding depended on which seeder
 * ran last.
 *
 *     php artisan db:seed --class=FacilitySeeder
 */
class FacilitySeeder extends Seeder
{
    public function run(): void
    {
        // Anything pre-existing without a type is a retail outlet.
        Store::query()->whereNull('type')->update(['type' => Store::TYPE_RETAIL]);

        $facilities = [
            ['name' => 'Warehouse A', 'code' => 'WH-A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE, 'location' => 'Kality Logistics Center'],
            ['name' => 'Warehouse B', 'code' => 'WH-B', 'type' => Store::TYPE_CENTRAL_WAREHOUSE, 'location' => 'Bole Logistics Center'],
            ['name' => 'Remote Warehouse', 'code' => 'WH-R', 'type' => Store::TYPE_REMOTE_WAREHOUSE, 'location' => 'Kality Sector 3 Depot'],
        ];

        foreach ($facilities as $facility) {
            Store::query()->updateOrCreate(
                ['name' => $facility['name']],
                $facility + ['status' => 'active'],
            );
        }

        $counts = Store::query()
            ->selectRaw('type, COUNT(*) as total')
            ->groupBy('type')
            ->pluck('total', 'type');

        $this->command->info('Facilities: ' . $counts->map(fn ($n, $t) => "{$t}={$n}")->implode(', '));
    }

}
