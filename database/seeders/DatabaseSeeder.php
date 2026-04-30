<?php

namespace Database\Seeders;

use Database\Seeders\Admin\ItemCategorySeeder;
use Database\Seeders\Admin\ItemColorSeeder;
use Database\Seeders\Admin\ItemImageSeeder;
use Database\Seeders\Admin\ItemPackagingTypeSeeder;
use Database\Seeders\Admin\ItemSeeder;
use Database\Seeders\Admin\ItemSizeSeeder;
use Database\Seeders\Admin\ItemVariantSeeder;
use Database\Seeders\Auth\RolePermissionSeeder;
use Database\Seeders\Customer\CustomerSeeder;
use Database\Seeders\StockKeeper\ItemInventoryLocationSeeder;
use Database\Seeders\StockKeeper\ItemOwnerSeeder;
use Database\Seeders\Store\ItemStoreSeeder;
use Database\Seeders\Store\StoreSeeder;
use Database\Seeders\Store\StoreVariantSeeder;
use Database\Seeders\User\UserSeeder;
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
            // StoreVariantSeeder::class,
        ]);
    }
}
