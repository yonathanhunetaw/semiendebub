<?php

declare(strict_types=1);

namespace Database\Seeders\Admin;

use App\Models\Item\ItemCategory;
use Illuminate\Database\Seeder;

/**
 * The catalogue's two-level category tree.
 *
 * Every name is unique across the whole tree, parents included: ItemSeeder
 * looks categories up by name, and a repeated name would make that ambiguous.
 */
class ItemCategorySeeder extends Seeder
{
    public const CATEGORIES = [
        'Notebooks' => [
            'Exercise Books', 'Notebooks A4', 'Notebooks A5', 'Notebooks A6', 'Notebooks B5',
            'Pocket Notebooks', 'Agendas & Diaries', 'Gift Notebooks',
        ],
        'Writing' => [
            'Ballpoint Pens', 'Pencils', 'Mechanical Pencils & Lead', 'Colour Pencils', 'Markers',
            'Erasers', 'Sharpeners', 'Correction Fluid',
        ],
        'Files & Folders' => [
            'Box Files', 'Folders', 'Clip Files', 'Clipboards', 'Document Cases', 'Display Books',
            'Clear Bags', 'Sheet Protectors & Transparencies',
        ],
        'Desk & Office' => [
            'Staplers & Removers', 'Punchers', 'Tape Dispensers', 'Paper Trays & Racks', 'Cutters & Blades',
            'Scissors', 'Fasteners & Clips', 'Elastic Bands', 'Binding Rings', 'Laminating Pouches',
            'Counting Aids',
        ],
        'Measuring & Geometry' => [
            'Rulers', 'Set Squares', 'T Squares', 'Compasses & Geometry Sets',
        ],
        'Art Supplies' => [
            'Watercolours', 'Oil Colours & Crayons', 'Paint Brushes', 'Drawing & Colouring Books',
        ],
        'Paper & Labels' => [
            'Printer Paper', 'Sticky Notes', 'Business Cards', 'Price Tags & Tickets',
        ],
        'School & Kids' => [
            'Pencil Bags', 'Globes & Maps', 'Toys',
        ],
    ];

    public function run(): void
    {
        foreach (self::CATEGORIES as $parentName => $children) {
            $parent = ItemCategory::firstOrCreate(['category_name' => $parentName, 'parent_id' => null]);

            foreach ($children as $childName) {
                ItemCategory::firstOrCreate(['category_name' => $childName, 'parent_id' => $parent->id]);
            }
        }
    }
}
