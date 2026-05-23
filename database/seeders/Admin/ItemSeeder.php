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
            'product_name' => 'Noteit',
            'product_description' => 'Premium Noteit ledger item with multi-dimensional grid layout bindings.',
            'packaging_details' => 'Distributed in individual pieces, dozens, and master cartons of 240 units.',
            'item_category_id' => 46, // NoteBook 25k
            'status' => 'active',
            'picsum_id' => 201,
            'file_prefix' => 'noteit',
            'color_ids' => [4, 5, 11], // Green (4), Red (5), Yellow (11)
            'size_ids' => [1, 2, 3],    // 3x5 Medium (1), 3x5 Large (2), 4x6 Small (3)
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],   // Piece
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0150],  // Dozen (Box)
                ['item_packaging_type_id' => 3, 'quantity' => 240, 'cbm' => 0.3100], // Carton
            ],
        ],
        [
            'product_name' => 'Ring',
            'product_description' => 'High-durability binding rings supporting full mechanical sizing spans.',
            'packaging_details' => 'Packed in production bundles of 100 or industrial master cartons of 1600.',
            'item_category_id' => 28, // Binding Accessories
            'status' => 'active',
            'picsum_id' => 202,
            'file_prefix' => 'ring',
            'color_ids' => [1, 4, 2, 5, 3, 11], // Blue(1), Green(4), Black(2), Red(5), White(3), Yellow(11)
            'size_ids' => [19, 20, 21, 22, 23, 24], // System IDs representing 6mm up to 16mm scales
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 100, 'cbm' => 0.0085],  // Packet
                ['item_packaging_type_id' => 3, 'quantity' => 1600, 'cbm' => 0.1450], // Carton
            ],
        ],
        [
            'product_name' => 'Bic',
            'product_description' => 'Classic fine-point industrial high-fluid retail ballpoint pen lines.',
            'packaging_details' => 'Sold in individual pieces, intermediate packets of 50, or master cases of 1000.',
            'item_category_id' => 12, // Pens & Writing
            'status' => 'active',
            'picsum_id' => 203,
            'file_prefix' => 'bic',
            'color_ids' => [1, 2, 5], // Blue (1), Black (2), Red (5)
            'size_ids' => [],         // No custom size variants
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0003],    // Piece
                ['item_packaging_type_id' => 2, 'quantity' => 50, 'cbm' => 0.0160],   // Packet
                ['item_packaging_type_id' => 3, 'quantity' => 1000, 'cbm' => 0.3400], // Carton
            ],
        ],
        [
            'product_name' => '2025 - 1',
            'product_description' => 'Premium quality distribution catalog ledger item for 2025.',
            'packaging_details' => 'Available in individual pieces, and master cartons of 96.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 201,
            'file_prefix' => '2025-1',
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
                    'file_prefix'         => $data['file_prefix'],
                    'product_description' => $data['product_description'],
                    'packaging_details' => $data['packaging_details'] ?? null,
                    'item_category_id' => $data['item_category_id'],
                    'status' => 'draft',
                    'is_incomplete' => true,
                ]);

            $item->colors()->sync($data['color_ids']);
            $item->sizes()->sync($data['size_ids']);
            $item->packagingTypes()->sync($this->buildPackagingSync($data['packaging']));

            $generator->sync($item);

            $this->populatePackagingQuantitiesAndCbm($item, $data);
            $this->evaluateDraftStatus($item, $data['status']);
        }
    }

    private function seedDeterministicVariantImages(Item $item, array $data): array
    {
        $prefix = $data['file_prefix']; // 'noteit'
        $itemImagesArray = [];
        $disk = Storage::disk('s3');

        // 1. Seed General Images (noteit_1.jpg to noteit_5.jpg)
        for ($i = 1; $i <= 5; $i++) {
            $name = "{$prefix}_{$i}.jpg";
            $this->uploadToMinio($disk, $item->id, $name);
            $itemImagesArray[] = "uploads/items/{$item->id}/{$name}";
        }

        // 2. Seed Variant Images (noteit_v1_1.jpg to noteit_v9_5.jpg)
        // We loop through the 9 expected variants and 5 images each
        for ($v = 1; $v <= 9; $v++) {
            for ($i = 1; $i <= 5; $i++) {
                $name = "{$prefix}_v{$v}_{$i}.jpg";
                $this->uploadToMinio($disk, $item->id, $name);
            }
        }

        return $itemImagesArray;
    }

    // Helper to keep code clean
    private function uploadToMinio($disk, $itemId, $fileName)
    {
        $sourcePath = storage_path("app/seed-images/{$fileName}");
        $minioPath = "uploads/items/{$itemId}/{$fileName}";

        if (File::exists($sourcePath) && !$disk->exists($minioPath)) {
            $disk->put($minioPath, File::get($sourcePath));
        }
    }

    private function populatePackagingQuantitiesAndCbm(Item $item, array $data): void
    {
        $item->load('variants');

        foreach ($item->variants as $variant) {
            $syncPayload = [];
            foreach ($data['packaging'] as $packConfig) {
                $packTypeId = (int) $packConfig['item_packaging_type_id'];

                // This perfectly matches the columns in our new migration
                $syncPayload[$packTypeId] = [
                    'quantity' => max(1, (int) $packConfig['quantity']),
                    'cbm' => $packConfig['cbm'] ?? 0.0000,
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
        $item->update([
            'status' => $requestedStatus,
            'is_incomplete' => false,
        ]);

        $item->refresh()->load('variants');
        foreach ($item->variants as $variant) {
            $variant->update(['status' => $requestedStatus]);
        }
    }
}