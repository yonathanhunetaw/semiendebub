<?php

namespace Database\Seeders\Admin;

use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use Illuminate\Database\Seeder;

/**
 * ItemSeeder
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE WORKFLOW: How to keep seeded data in sync with admin UI edits
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Run `php artisan db:seed` (or migrate:fresh --seed) to create items.
 *    Factories auto-download picsum images and upload them to MinIO.
 *
 * 2. Go to the admin UI, edit the item. Change images, description, etc.
 *    The controller saves the new MinIO keys to the DB.
 *
 * 3. To bake those changes back into the seeder so `migrate:fresh --seed`
 *    produces the same result:
 *
 *    a) For IMAGES: find the picsum ID that matches your chosen image (or
 *       download it to storage/app/seed-images/ and use ->withLocalImages()).
 *       Pin it with ->withPicsumId(N) — this always fetches the same photo.
 *
 *    b) For TEXT FIELDS: just update the array passed to ->create([...]).
 *
 *    c) For RELATIONS (color, size, packaging): update the ->afterCreating()
 *       calls below.
 *
 * 4. The next `migrate:fresh --seed` will:
 *    - Re-create the item with the same text/relations
 *    - Upload the same images to MinIO (same picsum ID = same photo)
 *    - Store the same MinIO keys in the DB
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * EXAMPLE BELOW shows three items with pinned picsum IDs.
 * Replace these with your real product data as you build out your catalog.
 */
class ItemSeeder extends Seeder
{
    public function run(): void
    {
        // ── Shared attribute records ─────────────────────────────────────────
// ── Shared attribute records ─────────────────────────────────────────
        $general = ItemCategory::firstOrCreate(['category_name' => 'General']);
        $apparel = ItemCategory::firstOrCreate(['category_name' => 'Apparel']);

        $red = ItemColor::firstOrCreate(['name' => 'Red']);
        $blue = ItemColor::firstOrCreate(['name' => 'Blue']);
        $black = ItemColor::firstOrCreate(['name' => 'Black']);

        $small = ItemSize::firstOrCreate(['name' => 'S']);
        $medium = ItemSize::firstOrCreate(['name' => 'M']);
        $large = ItemSize::firstOrCreate(['name' => 'L']);

        $piece = ItemPackagingType::firstOrCreate(['name' => 'Piece']);
        $box = ItemPackagingType::firstOrCreate(['name' => 'Box']);
        $carton = ItemPackagingType::firstOrCreate(['name' => 'Carton']);

        // ── Item 1: Red Widget ───────────────────────────────────────────────
        // Pinned to picsum ID 237 — always the same image on reseed.
        // To change the image: update withPicsumId() or switch to withLocalImages().
        $widget = Item::factory()
            ->withPicsumId(237)
            ->create([
                'product_name' => 'Red Widget',
                'product_description' => 'A sturdy, multi-purpose red widget suitable for all environments.',
                'packaging_details' => '1 Piece per box, 12 boxes per carton.',
                'status' => 'active',
                'item_category_id' => $general->id,
            ]);

        // Packaging hierarchy: Piece(1) → Box(12 pieces) → Carton(10 boxes)
        $widget->packagingTypes()->sync([
            $piece->id => ['quantity' => 1],
            $box->id => ['quantity' => 12],
            $carton->id => ['quantity' => 10],
        ]);

        // Variants for this item
        foreach ([$small, $medium, $large] as $size) {
            ItemVariant::factory()
                ->for($widget)
                ->withPicsumId(237 + $size->id) // Different picsum per size
                ->create([
                    'item_color_id' => $red->id,
                    'item_size_id' => $size->id,
                    'item_packaging_type_id' => $piece->id,
                    'status' => 'active',
                ]);
        }

        // ── Item 2: Classic T-Shirt ──────────────────────────────────────────
        $tshirt = Item::factory()
            ->withPicsumId(442)
            ->create([
                'product_name' => 'Classic T-Shirt',
                'product_description' => 'Premium cotton t-shirt with a relaxed fit.',
                'packaging_details' => 'Individually packed in a polybag.',
                'status' => 'active',
                'item_category_id' => $apparel->id,
            ]);

        $tshirt->packagingTypes()->sync([
            $piece->id => ['quantity' => 1],
            $box->id => ['quantity' => 6],
        ]);

        foreach ([$blue, $black] as $color) {
            foreach ([$small, $medium, $large] as $size) {
                ItemVariant::factory()
                    ->for($tshirt)
                    ->withPicsumId(442 + $color->id + $size->id)
                    ->create([
                        'item_color_id' => $color->id,
                        'item_size_id' => $size->id,
                        'item_packaging_type_id' => $piece->id,
                        'status' => 'active',
                    ]);
            }
        }

        // ── Add more items here as you build out your catalog ────────────────
        // Follow the same pattern:
        //   Item::factory()->withPicsumId(N)->create([...])
        //   then attach packaging and create variants.
    }
}
