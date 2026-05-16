<?php

namespace Database\Seeders\Admin;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Services\ItemVariantGenerationService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\File;

class ItemSeeder extends Seeder
{
    /**
     * The Matrix Definition matching your real assets directory layout.
     */
    // ═════════════════════════════════════════════════════════════════════════
    // SEED REFERENCE DIRECTORY
    // Use these hardcoded structural lookup IDs when defining new items below.
    // ═════════════════════════════════════════════════════════════════════════
    //
    // 1. LEAF SUBCATEGORY IDS (`item_category_id`)
    //    ┌───────────────────────────┬───────────────────────────┐
    //    │ 12 → Pens & Writing       │ 45 → Agenda               │
    //    │ 28 → Binding Accessories   │ 46 → NoteBook 25k         │
    //    │ 35 → Desk Organisation    │ 47 → NoteBook A4          │
    //    └───────────────────────────┴───────────────────────────┘
    //
    // 2. CORE SYSTEM COLORS (`color_ids`)
    //    ┌───────────────────────────┬───────────────────────────┐
    //    │ 1  → Blue                 │ 4  → Green                │
    //    │ 2  → Black                │ 5  → Red                  │
    //    │ 3  → White                │ 11 → Yellow               │
    //    └───────────────────────────┴───────────────────────────┘
    //
    // 3. BOOK & COMPONENT SIZES (`size_ids`)
    //    ┌───────────────────────────┬───────────────────────────┐
    //    │ 1  → Medium (M)           │ 21 → Ring 10mm            │
    //    │ 2  → Large (L)            │ 22 → Ring 12mm            │
    //    │ 3  → Small (S)            │ 23 → Ring 14mm            │
    //    │ 19 → Ring 6mm             │ 24 → Ring 16mm            │
    //    │ 20 → Ring 8mm             │ ... (Leave [] for None)   │
    //    └───────────────────────────┴───────────────────────────┘
    //
    // 4. PACKAGING UNIT TYPES & MULTIPLIERS (`packaging`)
    //    ┌───────────────────────────┬───────────────────────────┐
    //    │ 1 → Piece   (Qty: 1)      │ 4 → Box     (Qty: 12/18)  │
    //    │ 2 → Packet  (Qty: 10/50)  │ 5 → Bundle  (Qty: Custom) │
    //    │ 3 → Cartoon (Qty: 120)    │ 6 → Bag     (Qty: Custom) │
    //    └───────────────────────────┴───────────────────────────┘
    //
    // ═════════════════════════════════════════════════════════════════════════
    // THE MATRIX DEFINITION
    // ═════════════════════════════════════════════════════════════════════════
    private array $items = [
        [
            'product_name' => '2025 - 1',
            'product_description' => 'Premium quality distribution catalog ledger item for 2025.',
            'packaging_details' => 'Available in individual pieces, and master cartons of 96.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 201,
            'file_prefix' => '2025-1', // ◄ Explicitly match your local filenames
            'color_ids' => [1, 2],
            'size_ids' => [1],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1600],
            ],
        ],
        [
            'product_name' => '2025 - ብልጭልጭ',
            'product_description' => 'Premium quality distribution catalog ledger item for 2025 - ብልጭልጭ.',
            'packaging_details' => 'Available in individual pieces, boxes of 12, and master cartons of 120.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 202,
            'file_prefix' => '2025-ብልጭልጭ',
            'color_ids' => [1, 2],
            'size_ids' => [1],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0015],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.2000],
            ],
        ],
        [
            'product_name' => '25k - 1 ፓሪስ',
            'product_description' => 'Premium quality distribution catalog ledger item for 25k - 1 ፓሪስ.',
            'packaging_details' => 'Available in individual pieces, boxes of 12, and master cartons of 120.',
            'item_category_id' => 46,
            'status' => 'active',
            'picsum_id' => 203,
            'file_prefix' => '25k-1ፓሪስ',
            'color_ids' => [2],
            'size_ids' => [1],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0008],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1100],
            ],
        ],
        [
            'product_name' => '25k - 5 ጨርቅ ማስታወሻ',
            'product_description' => 'Premium quality distribution catalog ledger item for 25k - 5 ጨርቅ ማስታወሻ.',
            'packaging_details' => 'Available in individual pieces, boxes of 12, and master cartons of 120.',
            'item_category_id' => 46,
            'status' => 'active',
            'picsum_id' => 204,
            'file_prefix' => '25k-5ጨርቅማስታወሻ',
            'color_ids' => [2],
            'size_ids' => [1],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0009],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1250],
            ],
        ]
    ];

    public function run(): void
    {
        /** @var ItemVariantGenerationService $generator */
        $generator = app(ItemVariantGenerationService::class);

        foreach ($this->items as $data) {
            $item = Item::factory()
                ->withPicsumId($data['picsum_id'])
                ->create([
                    'product_name' => $data['product_name'],
                    'product_description' => $data['product_description'],
                    'packaging_details' => $data['packaging_details'] ?? null,
                    'item_category_id' => $data['item_category_id'],
                    'status' => 'draft',
                    'is_incomplete' => true,
                ]);

            $item->colors()->sync($data['color_ids']);
            $item->sizes()->sync($data['size_ids']);
            $item->packagingTypes()->sync(
                $this->buildPackagingSync($data['packaging'])
            );

            // Generate physical variants
            $generator->sync($item);

            $this->populatePackagingQuantitiesAndCbm($item, $data);

            // FIX: Load variant images from local folder up to 5 files
            $this->seedDeterministicVariantImages($item, $data);

            // Re-evaluate draft metrics to unlock live production status
            $this->evaluateDraftStatus($item, $data['status']);
        }
    }

    /**
     * FIXED: Loops up to 5 images per variant matching your local filesystem.
     */
    private function seedDeterministicVariantImages(Item $item, array $data): void
    {
        $item->load('variants');
        $prefix = $data['file_prefix'];

        $itemImagesArray = [];

        // 1. Process and upload images to the ITEM level folder (0-indexed to match img-0)
        for ($index = 0; $index < 5; $index++) {
            // Matches your desktop source filenames: prefix_1.jpg, prefix_2.jpg, etc.
            $sourceFileName = "{$prefix}_" . ($index + 1) . ".jpg";
            $sourcePath = storage_path("app/seed-images/{$sourceFileName}");

            // 🎯 EXACT MINIO PATH STRUCTURE
            $minioPath = "uploads/items/{$item->id}/img-{$index}.jpg";

            if (File::exists($sourcePath)) {
                // Check and upload to MinIO disk
                if (!Storage::disk('minio')->exists($minioPath)) {
                    Storage::disk('minio')->put($minioPath, File::get($sourcePath));
                }

                // Save the exact format your frontend resolver context expects
                $itemImagesArray[] = "/duka-images/" . $minioPath;
            }
        }

        // 2. 🎯 SAVE IT TO THE ITEM LEVEL ('general_images')
        if (!empty($itemImagesArray)) {
            $item->update([
                'general_images' => $itemImagesArray
            ]);
        }

        // 3. Keep your variants in sync by assigning the same item-level images to them
        foreach ($item->variants as $variant) {
            $variant->update([
                'images' => $itemImagesArray
            ]);
        }
    }
    private function populatePackagingQuantitiesAndCbm(Item $item, array $data): void
    {
        $item->load('variants');

        foreach ($item->variants as $variant) {
            $syncPayload = [];
            foreach ($data['packaging'] as $packConfig) {
                $packTypeId = (int) $packConfig['item_packaging_type_id'];

                $syncPayload[$packTypeId] = [
                    'quantity' => max(1, (int) $packConfig['quantity']),
                    'cbm' => $packConfig['cbm'] ?? 0.0000,
                    'item_color_id' => $variant->item_color_id,
                    'item_size_id' => $variant->item_size_id,
                ];
            }

            if (method_exists($variant, 'packagingQuantities')) {
                $variant->packagingQuantities()->sync($syncPayload);
            }
        }
    }

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

    private function evaluateDraftStatus(Item $item, string $requestedStatus): void
    {
        // 1. Force the parent item status to active/requested state
        $item->update([
            'status' => $requestedStatus,
            'is_incomplete' => false,
        ]);

        // 2. ⚡ CRITICAL: Loop through and activate the variants so they show up as "Active" in your store tables
        $item->refresh()->load('variants');
        foreach ($item->variants as $variant) {
            $variant->update([
                'status' => $requestedStatus // Flips variant status to 'active'
            ]);

            // Sync up the store variant connection maps to match
            if (method_exists($this, 'applyAvailabilityToStores')) {
                $this->applyAvailabilityToStores($variant, $requestedStatus === 'active');
            }
        }
    }
}