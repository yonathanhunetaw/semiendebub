<?php

namespace Database\Seeders\Store;

use App\Models\Store\Store;
use Illuminate\Database\Seeder;

class StoreSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Example stores
        $stores = [
            [
                'name' => 'Main Store',
                'location' => 'Merkato',
                'manager' => 'Abebe Tesfaye',
            ],
            [
                'name' => 'Second Store',
                'location' => 'CMC',
                'manager' => 'User 2323',
            ],
            [
                'name' => 'Online Store',
                'location' => 'Gullele',
                'manager' => 'User 4234',
            ],
        ];

        foreach ($stores as $store) {
            Store::create($store);
        }
    }
}
