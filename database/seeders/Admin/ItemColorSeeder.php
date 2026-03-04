<?php

namespace Database\Seeders\Admin;

use App\Models\Items\ItemColor;
use Illuminate\Database\Seeder;

class ItemColorSeeder extends Seeder
{
    public function run()
    {
        $colors = ['Red', 'Blue', 'Green', 'Yellow', 'Black', 'White', 'Purple', 'Orange', 'Pink', 'Brown', 'Mixed'];
        foreach ($colors as $colorName) {
            ItemColor::firstOrCreate(['name' => $colorName]);
        }

    }
}
