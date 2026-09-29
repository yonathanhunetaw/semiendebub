<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use Illuminate\Database\Seeder;

/**
 * The facility network a shipment can route between.
 *
 * Existing rows are retail outlets. This adds the warehouse-type facilities so
 * both ends of a shipment can be any of: retail store, central warehouse, or
 * remote warehouse — and stocks them, so a dispatch out of a warehouse actually
 * has units to move.
 *
 *     php artisan db:seed --class=FacilitySeeder
 */
class FacilitySeeder extends Seeder
{
    /** How many SKUs each warehouse is stocked with. */
    private const SKUS_PER_WAREHOUSE = 40;

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

        $this->stockTheWarehouses();

        $counts = Store::query()
            ->selectRaw('type, COUNT(*) as total')
            ->groupBy('type')
            ->pluck('total', 'type');

        $this->command->info('Facilities: ' . $counts->map(fn ($n, $t) => "{$t}={$n}")->implode(', '));
    }

    /**
     * Give the warehouse facilities real inventory.
     *
     * Without it a dispatch out of Warehouse A books out zero units: the ledger
     * clamps at zero rather than going negative, so the shipment would appear to
     * move while nothing actually left.
     */
    private function stockTheWarehouses(): void
    {
        $warehouses = Store::query()->warehouses()->pluck('id');

        if ($warehouses->isEmpty()) {
            return;
        }

        $variantIds = ItemVariant::query()
            ->inRandomOrder()
            ->limit(self::SKUS_PER_WAREHOUSE)
            ->pluck('id');

        $seeded = 0;

        foreach ($warehouses as $warehouseId) {
            foreach ($variantIds as $variantId) {
                ItemStock::updateOrCreate(
                    [
                        'item_variant_id' => $variantId,
                        'location_type' => Store::class,
                        'location_id' => $warehouseId,
                    ],
                    ['quantity' => random_int(80, 400), 'min_stock_level' => 20],
                );
                $seeded++;
            }
        }

        $this->command->info("Stocked {$seeded} warehouse ledger rows.");
    }
}
