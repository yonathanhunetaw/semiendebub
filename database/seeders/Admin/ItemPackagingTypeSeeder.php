<?php

declare(strict_types=1);

namespace Database\Seeders\Admin;

use App\Models\Item\ItemPackagingType;
use Illuminate\Database\Seeder;

/**
 * The canonical packaging vocabulary.
 *
 * This list is mirrored by classifyPackagingTier() in
 * resources/js/Components/Seller/itemShowHelpers.ts. A name this seeder
 * introduces but that function cannot classify is dropped silently from the
 * packaging picker, so the two must be changed together.
 *
 * ORDER IS LOAD-BEARING. ItemSeeder names packaging by numeric id in 373
 * places (`'item_packaging_type_id' => 3`, and so on), so these rows must
 * keep the ids they have always had. New types are appended, never inserted,
 * and nothing is reordered into "sensible" sequence — doing so would silently
 * repoint a third of the catalogue at the wrong packaging.
 *
 * How many pieces a unit holds is *not* stored here — it varies per item and
 * lives on the item_packaging_type_item pivot (`quantity`). The figures below
 * are only the conventional defaults the admin form starts from.
 */
class ItemPackagingTypeSeeder extends Seeder
{
    /**
     * id => [name, conventional pieces per unit].
     *
     * Id 3 was seeded as "Cartoon". It is spelled correctly here and the
     * repair migration renames the existing row in place, so the id — and
     * therefore every ItemSeeder reference to it — is unchanged.
     */
    private const PACKAGING_TYPES = [
        1 => ['Piece', 1],
        2 => ['Packet', 50],
        3 => ['Carton', 240],
        4 => ['Box', 12],
        5 => ['Bundle', 10],
        6 => ['Bag', 100],
        7 => ['Doz', 12],
    ];

    public function run(): void
    {
        foreach (self::PACKAGING_TYPES as $id => [$name, $quantity]) {
            // Keyed on id, not name, so a re-run on a populated database
            // neither duplicates rows nor renumbers them. The previous version
            // used create() and raised a duplicate on every second run.
            ItemPackagingType::updateOrCreate(
                ['id' => $id],
                ['name' => $name],
            );
        }
    }

    /** Conventional pieces-per-unit for a packaging name, for form defaults. */
    public static function defaultQuantityFor(string $name): int
    {
        foreach (self::PACKAGING_TYPES as [$typeName, $quantity]) {
            if (strcasecmp($typeName, $name) === 0) {
                return $quantity;
            }
        }

        return 1;
    }
}
