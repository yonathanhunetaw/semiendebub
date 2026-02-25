<?php

namespace Database\Seeders;

use Database\Seeders\Auth\RolePermissionSeeder;
use Database\Seeders\Auth\UserSeeder;
use Database\Seeders\Catalog\ItemCategorySeeder;
use Database\Seeders\Catalog\ItemColorSeeder;
use Database\Seeders\Catalog\ItemImageSeeder;
use Database\Seeders\Catalog\ItemPackagingTypeSeeder;
use Database\Seeders\Catalog\ItemSeeder;
use Database\Seeders\Catalog\ItemSizeSeeder;
use Database\Seeders\Catalog\ItemVariantSeeder;
use Database\Seeders\Entities\CustomerSeeder;
use Database\Seeders\Inventory\ItemInventoryLocationSeeder;
use Database\Seeders\Inventory\ItemOwnerSeeder;
use Database\Seeders\Store\ItemStoreSeeder;
use Database\Seeders\Store\StoreSeeder;
use Database\Seeders\Store\StoreVariantSeeder;
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
            ItemSeeder::class,
            ItemVariantSeeder::class,
            ItemImageSeeder::class,
            ItemOwnerSeeder::class,
            ItemStoreSeeder::class,
            StoreVariantSeeder::class,
        ]);
    }
}
