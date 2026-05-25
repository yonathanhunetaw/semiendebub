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
    // 1. CATEGORY IDS (`item_category_id`)
    //    ┌───────────────────────────┬───────────────────────────┬───────────────────────────┐
    //    │ NOTEBOOKS                 │ WRITING TOOLS             │ FILES & FOLDERS           │
    //    │ 1 → Subject               │ 10 → Bic Pen              │ 19 → Box File             │
    //    │ 2 → NoteBook 18k          │ 11 → Diamond pen          │ 20 → Folder               │
    //    │ 3 → NoteBook 25k          │ 12 → Pencil               │ 21 → Clip file            │
    //    │ 4 → Agenda                │ 13 → Pencil Colored       │ 22 → Clipboard            │
    //    │ 5 → NoteBook 32k          │ 14 → Eraser               │ 23 → Document Case        │
    //    │ 6 → NoteBook 60k          │ 15 → Sharpener            │ 24 → Display book         │
    //    │ 7 → NoteBook A4           │ 16 → Marker               │ 25 → Binding              │
    //    │ 8 → NoteBook A5           │ 17 → Highlighter          │                           │
    //    │ 9 → Locally Made          │ 18 → Fluid (Whiteout)     │                           │
    //    ├───────────────────────────┼───────────────────────────┼───────────────────────────┤
    //    │ DESK ACCESSORIES          │ MEASURING TOOLS           │ OFFICE SUPPLIES           │
    //    │ 26 → Stapler              │ 35 → Ruler                │ 39 → Envelope             │
    //    │ 27 → Puncher              │ 36 → Set Square           │ 40 → Sticky Notes         │
    //    │ 28 → Fastener             │ 37 → T square             │ 41 → Calculator           │
    //    │ 29 → Elastic band         │ 38 → Protractor           │ 42 → Paper Clips          │
    //    │ 30 → Paper tray           │                           │ 43 → Staples              │
    //    │ 31 → Tape Dispenser       │                           │ 44 → Scissors             │
    //    │ 32 → Globe                │                           │                           │
    //    │ 33 → Glue                 │                           │                           │
    //    ├───────────────────────────┼───────────────────────────┼───────────────────────────┤
    //    │ ART MATERIALS             │ SCHOOL SUPPLIES           │ COPY & PRINTER PAPER      │
    //    │ 45 → Watercolor           │ 50 → Pen and Pencil       │ 55 → A4 Printer Paper     │
    //    │ 46 → Oil Color            │ 51 → Subject              │ 56 → Printer Paper A3     │
    //    │ 47 → Paint Brush          │ 52 → Geometry Set         │ 57 → Letter               │
    //    │ 48 → Canvas               │ 53 → Compass              │ 58 → Legal                │
    //    │ 49 → Sketch Book          │ 54 → Drawing Book         │ 59 → Tabloid              │
    //    └───────────────────────────┴───────────────────────────┴───────────────────────────┘
    //
    // 2. CORE SYSTEM COLORS (`color_ids`)
    //     
    //    ┌───────────────────────────┬───────────────────────────┐ 
    //    │ 1  → Red                  │ 7  → Purple               │
    //    │ 2  → Blue                 │ 8  → Orange               │
    //    │ 3  → Green                | 9  → Pink                 |
    //    | 4  → Yellow               │ 10 → Brown                │
    //    | 5  → Black                | 11 → Mixed                |
    //    | 6  → White                |                           |
    //    └───────────────────────────┴───────────────────────────┘
    //     
    // 3. COMPONENT SIZES (`size_ids`)
    //    ┌───────────────────────────┬───────────────────────────┬───────────────────────────┐
    //    │ 1  → 3x3Inch              │ 13 → A5                   │ 25 → 18mm                 │
    //    │ 2  → 4x4Inch              │ 14 → A6                   │ 26 → 20mm                 │
    //    │ 3  → 5x5Inch              │ 15 → A7                   │ 27 → 22mm                 │
    //    │ 4  → 10x10mm              │ 16 → A8                   │ 28 → 24mm                 │
    //    │ 5  → Small                │ 17 → A9                   │ 29 → 26mm                 │
    //    │ 6  → Medium               │ 18 → A10                  │ 30 → 28mm                 │
    //    │ 7  → Large                │ 19 → 6mm                  │ 31 → 30mm                 │
    //    │ 8  → Extra Large          │ 20 → 8mm                  │ 32 → 32mm                 │
    //    │ 9  → A1                   │ 21 → 10mm                 │ 33 → 34mm                 │
    //    │ 10 → A2                   │ 22 → 12mm                 │ 34 → 36mm                 │
    //    │ 11 → A3                   │ 23 → 14mm                 │                           │
    //    │ 12 → A4                   │ 24 → 16mm                 │ ... (Leave [] for None)   │
    //    └───────────────────────────┴───────────────────────────┴───────────────────────────┘
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
            'color_ids' => [11],  // Mixed (11)
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
            'color_ids' => [1, 2, 3, 5, 6], // Red(1), Blue(2), Green(3), Black(5), White(6)
            'size_ids' => [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34], // System IDs representing 6mm up to 36mm scales
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
            'color_ids' => [2, 5, 1], // Blue (2), Black (5), Red (1)
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
            'color_ids' => [5, 10], // Black (5), Browne (10)
            'size_ids' => [13], // A5 (13)
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],   // Piece
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1600], // Carton
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
            'color_ids' => [5, 10], // Black (5), Browne (10)
            'size_ids' => [13], // A5 (13)
            'packaging' => [
                ['item_packaging_type_id' => 5, 'quantity' => 1, 'cbm' => 0.0015],
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
            'color_ids' => [5, 10], // Black (5), Browne (10)
            'size_ids' => [13], // A5 (13)
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
            'color_ids' => [5, 10], // Black (5), Browne (10)
            'size_ids' => [13], // A5 (13)
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0009],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1250],
            ],
        ],
        [
            'product_name' => 'A3 - Paper Laola',
            'product_description' => 'Professional A3-sized Laola format binder for high-capacity document storage.',
            'packaging_details' => 'Available in bundles of 200 and master cartons of 5 bundles.',
            'item_category_id' => 56, // A3 Printer Paper
            'status' => 'active',
            'picsum_id' => 205,
            'file_prefix' => 'a3-paperlaola',
            'color_ids' => [6], // White (6)
            'size_ids' => [11],    // A3 (11)
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0025],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.2000],
            ],
        ],
        [
            'product_name' => 'A3 - Road map',
            'product_description' => 'Specialized A3-sized road map ledger for logistics and navigation planning.',
            'packaging_details' => 'Available in individual pieces and master cartons of 100.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 206,
            'file_prefix' => 'a3-roadmap',
            'color_ids' => [1, 3], // Blue (1), White (3)
            'size_ids' => [11],    // A3 (11)
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0020],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.2000],
            ],
        ],
        [
            'product_name' => 'A4 - Binding file ዉዱ',
            'product_description' => 'Durable A4-sized binding file (ዉዱ) for secure archive and presentation.',
            'packaging_details' => 'Available in individual pieces, boxes of 12, and master cartons of 120.',
            'item_category_id' => 28,
            'status' => 'active',
            'picsum_id' => 207,
            'file_prefix' => 'a4-binding-file-wudu',
            'color_ids' => [2, 5], // Black (2), Red (5)
            'size_ids' => [12],    // A4 (12)
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0015],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1800],
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
                    'file_prefix' => $data['file_prefix'],
                    'product_description' => $data['product_description'],
                    'packaging_details' => $data['packaging_details'] ?? null,
                    'item_category_id' => $data['item_category_id'],
                    'status' => 'draft',
                    'is_incomplete' => true,
                ]);

            $item->colors()->sync($data['color_ids']);
            $item->sizes()->sync($data['size_ids']);
            $item->packagingTypes()->sync($this->buildPackagingSync($data['packaging']));

            // ✅ ADD THIS
            $images = $this->seedDeterministicVariantImages($item, $data);

            $item->update([
                'general_images' => $images
            ]);

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