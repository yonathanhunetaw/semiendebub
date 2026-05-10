<?php

namespace Database\Seeders\Admin;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Services\ItemVariantGenerationService;
use App\Models\Store\StoreVariant;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ItemSeeder extends Seeder
{
    // ─── Seed definitions ────────────────────────────────────────────────────
    //
    // Keys mirror exactly what ItemController::store() + ItemForm send:
    //   - item_category_id  → the subcategory (leaf) id, same as the form's item_category_id field
    //   - color_ids         → array of existing ItemColor ids
    //   - size_ids          → array of existing ItemSize ids (empty = no-size variant)
    //   - packaging         → [ ['item_packaging_type_id' => X, 'quantity' => N], … ]
    //                         matches resolvePackagingPayload() input
    //   - general_images    → relative paths under storage/app/public/
    //                         (same format handleUploads() returns)
    //   - status            → desired status; will be forced to 'draft' if images
    //                         don't satisfy the ≥2-per-variant proof gate
    //   - variant_images    → [ 'colorId:sizeId:packagingId' => [ 'path1', 'path2', … ] ]
    //                         up to 5 paths, stored exactly where persistVariantImages()
    //                         would put them: uploads/variants/{SKU}/{SKU}_N.jpg
    //                         Use null for an empty slot.

    private array $items = [
        [
            'product_name' => 'Noteit Sticky Note',
            'product_description' => 'NoteIt / Sticky Notes is a simple and convenient tool for quick memos, reminders, and desk organisation.',
            'packaging_details' => 'Available in single packs, boxes of 12, and boxes of 18.',
            'item_category_id' => 45,        // subcategory id (leaf)
            'status' => 'active',
            'color_ids' => [1, 2, 3, 4, 11],
            'size_ids' => [1, 2, 3],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1],
                ['item_packaging_type_id' => 2, 'quantity' => 12],
                ['item_packaging_type_id' => 3, 'quantity' => 18],
            ],
            // General item images (stored in public disk, relative to storage/app/public/)
            'general_images' => [
                'images/product_images/noteit_sticky_note_1.jpg',
            ],
            // Per-variant placeholder images.
            // Keys MUST match the comboKey format: "colorId:sizeId:packagingId"
            // where null dimensions use the string "null".
            // Values are up to 5 relative paths (same format as persistVariantImages output).
            // Provide at least 2 per variant to pass the proof gate and allow non-draft status.
            'variant_images' => [], // populated dynamically below via _buildVariantImages()
        ],

        [
            'product_name' => 'Ring',
            'product_description' => 'Binding rings for punched papers. Available in multiple diameters.',
            'packaging_details' => 'Sold in boxes of 50 or 18.',
            'item_category_id' => 28,
            'status' => 'active',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 50],
                ['item_packaging_type_id' => 3, 'quantity' => 18],
            ],
            'general_images' => [
                'images/product_images/ring_1.jpg',
            ],
            'variant_images' => [],
        ],

        [
            'product_name' => 'Bic Pen',
            'product_description' => 'Classic Bic pens. Smooth writing, reliable ink.',
            'packaging_details' => 'Available individually, in boxes of 50, or boxes of 20.',
            'item_category_id' => 12,
            'status' => 'active',
            'color_ids' => [2, 5, 1],
            'size_ids' => [],        // no sizes → "null" dimension
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1],
                ['item_packaging_type_id' => 2, 'quantity' => 50],
                ['item_packaging_type_id' => 3, 'quantity' => 20],
            ],
            'general_images' => [
                'images/product_images/bic_pen_1.jpg',
            ],
            'variant_images' => [],
        ],
    ];

    // ─────────────────────────────────────────────────────────────────────────

    public function run(): void
    {
        /** @var ItemVariantGenerationService $generator */
        $generator = app(ItemVariantGenerationService::class);

        foreach ($this->items as $data) {
            // 1. Create the item row (status always starts as draft — same as controller)
            $item = Item::create([
                'product_name' => $data['product_name'],
                'product_description' => $data['product_description'],
                'packaging_details' => $data['packaging_details'] ?? null,
                'item_category_id' => $data['item_category_id'],
                'status' => 'draft',
                'general_images' => $data['general_images'],
                'is_incomplete' => true,
            ]);

            // 2. Sync attributes — exactly as resolveOptionIds / resolvePackagingPayload do
            $item->colors()->sync($data['color_ids']);
            $item->sizes()->sync($data['size_ids']);
            $item->packagingTypes()->sync(
                $this->buildPackagingSync($data['packaging'])
            );

            // 3. Generate all variant rows + store_variant records
            //    (ItemVariantGenerationService::sync is the single source of truth)
            $generator->sync($item);

            // 4. Attach placeholder images to each variant
            //    This mirrors persistVariantImages() exactly.
            $this->seedVariantImages($item, $data);

            // 5. Re-evaluate draft gate — same logic as evaluateDraftStatus()
            $this->evaluateDraftStatus($item, $data['status']);
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Convert packaging array from form format to sync() pivot format.
     *
     * Input:  [ ['item_packaging_type_id' => 1, 'quantity' => 12], … ]
     * Output: [ 1 => ['quantity' => 12], … ]
     */
    private function buildPackagingSync(array $packaging): array
    {
        $result = [];
        foreach ($packaging as $row) {
            $id = (int) $row['item_packaging_type_id'];
            if ($id > 0) {
                $result[$id] = ['quantity' => max(1, (int) ($row['quantity'] ?? 1))];
            }
        }
        return $result;
    }

    /**
     * Assign placeholder images to every variant of $item.
     *
     * Image paths follow the same convention as persistVariantImages():
     *   uploads/variants/{SKU}/{SKU}_1.jpg
     *   uploads/variants/{SKU}/{SKU}_2.jpg
     *   …up to 5…
     *
     * For seeded items we derive a placeholder path from a per-product folder
     * under public/images/product_images/variants/.  If the file doesn't exist on
     * disk (CI / fresh install) we just store the path string — the same way a
     * real upload would.  Swap the placeholder folder for real images in production.
     *
     * If the item definition provides explicit 'variant_images' keyed by comboKey
     * those are used as-is.  Otherwise we auto-generate paths.
     */
    private function seedVariantImages(Item $item, array $data): void
    {
        $item->load([
            'variants.itemColor',
            'variants.itemSize',
            'variants.itemPackagingType',
        ]);

        $safeName = Str::snake($data['product_name']);
        $explicitMap = $data['variant_images'] ?? [];

        foreach ($item->variants as $variant) {
            $colorId = $variant->item_color_id ?? 'null';
            $sizeId = $variant->item_size_id ?? 'null';
            $packId = $variant->item_packaging_type_id ?? 'null';
            $key = implode(':', [$colorId, $sizeId, $packId]);

            $sku = $variant->sku ?? ('variant_' . $variant->id);

            // Use explicit paths if provided, otherwise auto-generate 2 placeholders
            // (2 = minimum proof count; add more if you want all 5 filled).
            if (!empty($explicitMap[$key])) {
                $paths = array_values(array_filter($explicitMap[$key]));
            } else {
                // Auto-generate paths in the same folder structure the real uploader uses.
                // Place actual JPEG files here for the Show page to render them.
                $paths = [
                    "uploads/variants/{$sku}/{$sku}_1.jpg",
                    "uploads/variants/{$sku}/{$sku}_2.jpg",
                ];

                // Optionally copy a per-product placeholder image into each slot so the
                // gallery renders something immediately.  Silently skips if source missing.
                $placeholderSource = "images/product_images/{$safeName}_1.jpg";
                if (Storage::disk('public')->exists($placeholderSource)) {
                    foreach ($paths as $destPath) {
                        if (!Storage::disk('public')->exists($destPath)) {
                            Storage::disk('public')->copy($placeholderSource, $destPath);
                        }
                    }
                }
            }

            $variant->update(['images' => $paths]);
        }
    }

    /**
     * Mirror of ItemController::evaluateDraftStatus().
     * Unlocks the item from draft once every variant has ≥2 images.
     */
    private function evaluateDraftStatus(Item $item, string $requestedStatus): void
    {
        $item->refresh()->load('variants');

        $allProven = $item->variants->every(function (ItemVariant $variant) {
            $raw = $variant->images;
            $images = is_array($raw)
                ? $raw
                : (is_string($raw) ? (json_decode($raw, true) ?: []) : []);
            return count($images) >= 2;
        });

        $finalStatus = $allProven ? $requestedStatus : 'draft';

        $item->update([
            'status' => $finalStatus,
            'is_incomplete' => !$allProven,
        ]);
    }

    private function calculateDynamicPrice(Item $item, ItemVariant $variant): float
    {
        $base = 10.00;

        // Use Str::contains for cleaner syntax
        if (Str::contains($item->product_name, 'Bic'))
            $base = 17.00;
        elseif (Str::contains($item->product_name, 'Ring'))
            $base = 15.00;
        elseif (Str::contains($item->product_name, 'Sticky'))
            $base = 10.00;

        // Access the quantity from the packaging type linked to this specific variant
        // We use the quantity stored in the variant itself (packaging_total_pieces)
        $totalQty = $variant->packaging_total_pieces ?? 1;

        $subtotal = $base * $totalQty;

        // Apply bulk discount if more than 1 piece
        if ($totalQty > 1) {
            $subtotal = $subtotal * 0.95;
        }

        return round($subtotal, 2);
    }
}
