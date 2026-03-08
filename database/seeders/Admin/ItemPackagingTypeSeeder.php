<?php

namespace Database\Seeders\Admin;

use App\Models\Item\ItemPackagingType;
use Illuminate\Database\Seeder;

class ItemPackagingTypeSeeder extends Seeder
{
    public function run(): void
    {
        $packagingTypes = [
            'Piece',
            'Packet',
            'Cartoon',
            'Box',
            'Bundle',
            'Bag',

        ];

        foreach ($packagingTypes as $type) {
            ItemPackagingType::create([
                'name' => $type,
            ]);
        }
    }
}
