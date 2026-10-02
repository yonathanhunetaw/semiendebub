<?php

declare(strict_types=1);

namespace Database\Seeders\StockKeeper;

use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Store\Store;
use Illuminate\Database\Seeder;

/**
 * Shop floor and back room for each physical store.
 *
 * A store's total stock lives on item_stocks at location_type = Store. These
 * rows say where inside the store part of that total sits, so the admin stock
 * tool can show a shelf figure that is recorded rather than, as it was,
 * one quarter of the store total worked out in the browser.
 *
 * The previous version created four free-text locations all pinned to whatever
 * store happened to come back from Store::first(), with no way to tell a shelf
 * from a stockroom.
 */
class ItemInventoryLocationSeeder extends Seeder
{
    /**
     * Stores with a sales floor, and what each calls its two areas.
     *
     * The Online Store is deliberately absent: it has no shop floor, so giving
     * it one would put a shelf figure on a screen that can never be stocked.
     */
    private const PHYSICAL_STORES = [
        'Main Store' => ['shelf' => 'Shop', 'backroom' => 'Shop Warehouse'],
        'Second Store' => ['shelf' => 'Shop Floor', 'backroom' => 'Back Room'],
    ];

    public function run(): void
    {
        foreach (self::PHYSICAL_STORES as $storeName => $areas) {
            $store = Store::where('name', $storeName)->first();

            if (! $store) {
                continue;
            }

            foreach ($areas as $kind => $name) {
                // Keyed on store + kind, not name: a store has exactly one
                // shelf and one back room, and renaming one must not create a
                // second of the same kind.
                ItemInventoryLocation::updateOrCreate(
                    ['store_id' => $store->id, 'kind' => $kind],
                    ['name' => $name, 'address' => ''],
                );
            }
        }
    }
}
