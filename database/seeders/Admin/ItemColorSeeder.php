<?php

declare(strict_types=1);

namespace Database\Seeders\Admin;

use App\Models\Item\ItemColor;
use Illuminate\Database\Seeder;

class ItemColorSeeder extends Seeder
{
    /**
     * "Assorted" is for sets and mixed packs sold as one thing (a box of
     * watercolours, a pack of crayons), so they don't fan out into a variant
     * per colour nobody picks.
     */
    public const COLORS = [
        'Red', 'Blue', 'Green', 'Yellow', 'Black', 'White', 'Purple', 'Orange', 'Pink', 'Brown', 'Gray',
        'Gold', 'Silver', 'Glitter', 'Assorted',
    ];

    public function run(): void
    {
        foreach (self::COLORS as $colorName) {
            ItemColor::firstOrCreate(['name' => $colorName]);
        }
    }
}
