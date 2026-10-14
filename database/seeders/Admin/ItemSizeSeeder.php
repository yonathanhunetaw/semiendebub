<?php

declare(strict_types=1);

namespace Database\Seeders\Admin;

use App\Models\Item\ItemSize;
use Illuminate\Database\Seeder;

/**
 * The size vocabulary, grouped by what is being measured. ItemSeeder refers to
 * sizes by name, so a name used there must exist here.
 */
class ItemSizeSeeder extends Seeder
{
    public const SIZES = [
        // Paper formats
        'A3', 'A4', 'A5', 'A6', 'B5',
        // Pocket-notebook formats (sheets cut from one full sheet)
        '18k', '25k', '32k', '60k',
        // Exercise books
        '9×7 in', '3 Subjects', '4 Subjects', '5 Subjects',
        // Sticky notes
        '3×3 in', '3×4 in', '3×5 in',
        // Lengths
        '15 cm', '20 cm', '30 cm', '35 cm', '50 cm', '60 cm',
        // Binding ring diameters
        '6 mm', '8 mm', '10 mm', '12 mm', '14 mm', '16 mm', '18 mm', '20 mm',
        '22 mm', '24 mm', '26 mm', '28 mm', '30 mm', '32 mm', '34 mm', '36 mm',
        // Pencil lead and grades
        '0.5 mm', '0.7 mm', 'HB', '2B', '4B', '6B', '8B',
        // Staples
        'No. 335', 'No. 435',
        // Laminating pouches
        '65×95 mm', '76×106 mm',
        // Generic
        'Small', 'Medium', 'Large', 'Extra Large',
    ];

    public function run(): void
    {
        foreach (self::SIZES as $name) {
            ItemSize::firstOrCreate(['name' => $name]);
        }
    }
}
