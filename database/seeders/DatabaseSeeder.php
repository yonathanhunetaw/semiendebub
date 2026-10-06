<?php

namespace Database\Seeders;

use Database\Seeders\Admin\ItemCategorySeeder;
use Database\Seeders\Admin\ItemColorSeeder;
use Database\Seeders\Admin\ItemPackagingTypeSeeder;
use Database\Seeders\Admin\ItemSeeder;
use Database\Seeders\Admin\ItemSizeSeeder;
use Database\Seeders\Auth\RolePermissionSeeder;
use Database\Seeders\Customer\CustomerSeeder;
use Database\Seeders\StockKeeper\ItemInventoryLocationSeeder;
use Database\Seeders\StockKeeper\ItemOwnerSeeder;
use Database\Seeders\Store\ItemStoreSeeder;
use Database\Seeders\Store\StoreSeeder;
use Database\Seeders\Store\StoreVariantSeeder;
use Database\Seeders\Seller\CartSeeder;
use Database\Seeders\User\UserSeeder;
use Database\Seeders\Inventory\StockLedgerSeeder;
use Database\Seeders\Inventory\StockLocationSeeder;
use Database\Seeders\Inventory\FleetSeeder;
use Database\Seeders\Inventory\WarehouseSeeder;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        // User::factory()->create([
        //     'name' => 'Test User',
        //     'email' => 'test@example.com',
        // ]);

        // Call other seeders here
        $this->call([
            RolePermissionSeeder::class,

            StoreSeeder::class,

            ItemInventoryLocationSeeder::class,
            UserSeeder::class,
            CustomerSeeder::class,
            ItemCategorySeeder::class,
            ItemColorSeeder::class,
            ItemSizeSeeder::class,
            ItemPackagingTypeSeeder::class,

            // ItemSeeder uploads whatever photography is committed under
            // storage/app/seed-images and records only the keys that land.
            // ItemImageSeeder used to run here too, uploading to the wrong
            // disk from filenames that have never existed — it was removed
            // rather than fixed, because ItemSeeder already does the job.
            ItemSeeder::class,

            ItemOwnerSeeder::class,

            ItemStoreSeeder::class,
            StoreVariantSeeder::class,

            CartSeeder::class,
            WarehouseSeeder::class,

            // The warehouse-type facilities, plus stock for them.
            //
            // This was never registered, so a standard seed produced three
            // retail stores and nothing else: there was no warehouse to
            // replenish *from*, which is the one route the shipment screens are
            // built around. It also has to run after the item seeders, because
            // stocking a warehouse needs variants to stock it with.
            FacilitySeeder::class,

            // The one location tree builds itself from the rows above through
            // model events; this only adds what nothing derives — Main Store's
            // Remote Hub.
            StockLocationSeeder::class,

            /*
             * item_stocks — the ledger of record — in one place, and last.
             *
             * It needs every location to exist first (stores, their shop floors
             * and back rooms, the off-site warehouses and the hub facilities)
             * and every variant to exist to be booked against. Three seeders
             * used to write this table with three different notions of a
             * quantity, and none of them ever stocked a shop floor.
             */
            StockLedgerSeeder::class,

            // The cars a shipment can be carried in.
            FleetSeeder::class,

            // Inter-store freight. Needs stores, users (for the creator, courier
            // and keeper on each agreement ledger) and stock at the origins, so
            // it goes last. It writes statuses directly and never moves stock.
            ShipmentDemoSeeder::class,
        ]);
    }
}
