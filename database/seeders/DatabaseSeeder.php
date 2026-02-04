<?php

namespace Database\Seeders;

use App\Models\User;
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
