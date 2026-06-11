<?php

namespace Database\Seeders\Admin;

use App\Models\Item\ItemSize;
use Illuminate\Database\Seeder;

class ItemSizeSeeder extends Seeder
{
    public function run(): void
    {
        $sizes = [
            // Inch-based (No 'mm')
            ['id' => 1, 'name' => '3x3Inch'],
            ['id' => 2, 'name' => '4x4Inch'],
            ['id' => 3, 'name' => '5x5Inch'],

            // Measurements (Include 'mm')
            ['id' => 4, 'name' => '10x10mm'],

            // Descriptive sizes (No 'mm')
            ['id' => 5, 'name' => 'Small'],
            ['id' => 6, 'name' => 'Medium'],
            ['id' => 7, 'name' => 'Large'],
            ['id' => 8, 'name' => 'Extra Large'],

            // Paper sizes (No 'mm')
            ['id' => 9, 'name' => 'A1'],
            ['id' => 10, 'name' => 'A2'],
            ['id' => 11, 'name' => 'A3'],
            ['id' => 12, 'name' => 'A4'],
            ['id' => 13, 'name' => 'A5'],
            ['id' => 14, 'name' => 'A6'],
            ['id' => 15, 'name' => 'A7'],
            ['id' => 16, 'name' => 'A8'],
            ['id' => 17, 'name' => 'A9'],
            ['id' => 18, 'name' => 'A10'],

            // Ring/Numerical measurements (Include 'mm')
            ['id' => 19, 'name' => '6mm'],
            ['id' => 20, 'name' => '8mm'],
            ['id' => 21, 'name' => '10mm'],
            ['id' => 22, 'name' => '12mm'],
            ['id' => 23, 'name' => '14mm'],
            ['id' => 24, 'name' => '16mm'],
            ['id' => 25, 'name' => '18mm'],
            ['id' => 26, 'name' => '20mm'],
            ['id' => 27, 'name' => '22mm'],
            ['id' => 28, 'name' => '24mm'],
            ['id' => 29, 'name' => '26mm'],
            ['id' => 30, 'name' => '28mm'],
            ['id' => 31, 'name' => '30mm'],
            ['id' => 32, 'name' => '32mm'],
            ['id' => 33, 'name' => '34mm'],
            ['id' => 34, 'name' => '36mm'],

            // Inch-based (No 'mm')
            ['id' => 35, 'name' => '335'],
            ['id' => 36, 'name' => '435'],
        ];

        foreach ($sizes as $size) {  // Changed from $sizeName to $size
            ItemSize::firstOrCreate([
                'name' => $size['name'],  // Access the 'name' key from the array
            ]);
        }
    }
}