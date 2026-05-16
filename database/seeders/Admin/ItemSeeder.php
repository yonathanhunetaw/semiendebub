<?php

namespace Database\Seeders\Admin;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemPackagingType;
use App\Services\ItemVariantGenerationService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ItemSeeder extends Seeder
{
    /**
     * Centralized Configuration Blueprint
     * Keeps text, relations, logistics (CBM), and pinned image IDs in one place.
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
            'product_name'        => '2025 - 1',
            'product_description' => 'Premium quality distribution catalog ledger item for 2025.',
            'packaging_details'   => 'Available in individual pieces, and master cartons of 96.',
            'item_category_id'    => 45, 
            'status'              => 'active',
            'picsum_id'           => 201,   // Pinned baseline image identifier for this item
            'color_ids'           => [1, 2], 
            'size_ids'            => [1],    
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1,   'cbm' => 0.0012], 
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1600], 
            ],
            'general_images' => [], // Processed and populated dynamically via the Factory bucket logic
            'variant_images' => [],
        ],
        [
            'product_name'        => '2025 - ብልጭልጭ',
            'product_description' => 'Premium quality distribution catalog ledger item for 2025 - ብልጭልጭ.',
            'packaging_details'   => 'Available in individual pieces, boxes of 12, and master cartons of 120.',
            'item_category_id'    => 45,
            'status'              => 'active',
            'picsum_id'           => 202,
            'color_ids'           => [1, 2],
            'size_ids'            => [1],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1,   'cbm' => 0.0015],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.2000],
            ],
            'general_images' => [],
            'variant_images' => [],
        ],
        [
            'product_name'        => '25k - 1 ፓሪስ',
            'product_description' => 'Premium quality distribution catalog ledger item for 25k - 1 ፓሪስ.',
            'packaging_details'   => 'Available in individual pieces, boxes of 12, and master cartons of 120.',
            'item_category_id'    => 46, 
            'status'              => 'active',
            'picsum_id'           => 203,
            'color_ids'           => [2],
            'size_ids' => [1],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1,   'cbm' => 0.0008],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1100],
            ],
            'general_images' => [],
            'variant_images' => [],
        ],
        [
            'product_name'        => '25k - 5 ጨርቅ ማስታወሻ',
            'product_description' => 'Premium quality distribution catalog ledger item for 25k - 5 ጨርቅ ማስታወሻ.',
            'packaging_details'   => 'Available in individual pieces, boxes of 12, and master cartons of 120.',
            'item_category_id'    => 46,
            'status'              => 'active',
            'picsum_id'           => 204,
            'color_ids'           => [2],
            'size_ids'            => [1], // [] for no sizes
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1,   'cbm' => 0.0009],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1250],
            ],
            'general_images' => [],
            'variant_images' => [],
        ]
    ];

    // ─────────────────────────────────────────────────────────────────────────

    public function run(): void
    {
        /** @var ItemVariantGenerationService $generator */
        $generator = app(ItemVariantGenerationService::class);

        foreach ($this->items as $data) {
            // 1. Create the Parent Item via Factory using your pinned Picsum ID workflow.
            // This pulls the photo, pushes it to MinIO, and sets 'general_images' automatically.
            $item = Item::factory()
                ->withPicsumId($data['picsum_id'])
                ->create([
                    'product_name'        => $data['product_name'],
                    'product_description' => $data['product_description'],
                    'packaging_details'   => $data['packaging_details'] ?? null,
                    'item_category_id'    => $data['item_category_id'],
                    'status'              => 'draft', 
                    'is_incomplete'       => true,
                ]);

            // 2. Sync core catalog attributes
            $item->colors()->sync($data['color_ids']);
            $item->sizes()->sync($data['size_ids']);
            $item->packagingTypes()->sync(
                $this->buildPackagingSync($data['packaging'])
            );

            // 3. Generate variant matrix records via your central pipeline service
            $generator->sync($item);

            // 4. Populate pivot table volume details
            $this->populatePackagingQuantitiesAndCbm($item, $data);

            // 5. Build dynamic variant images from Picsum via Factory logic
            $this->seedDeterministicVariantImages($item, $data);

            // 6. Re-evaluate status rules to lift item out of draft mode
            $this->evaluateDraftStatus($item, $data['status']);
        }
    }

    // ─── Core Helpers ────────────────────────────────────────────────────────

    /**
     * Map configuration layout directly into your pivot tracking tables.
     */
    private function populatePackagingQuantitiesAndCbm(Item $item, array $data): void
    {
        $item->load('variants');

        foreach ($item->variants as $variant) {
            $syncPayload = [];

            foreach ($data['packaging'] as $packConfig) {
                $packTypeId = (int)$packConfig['item_packaging_type_id'];

                $syncPayload[$packTypeId] = [
                    'quantity'      => max(1, (int)$packConfig['quantity']),
                    'cbm'           => $packConfig['cbm'] ?? 0.0000,
                    'item_color_id' => $variant->item_color_id,
                    'item_size_id'  => $variant->item_size_id,
                ];
            }

            if (method_exists($variant, 'packagingQuantities')) {
                $variant->packagingQuantities()->sync($syncPayload);
            }
        }
    }

    /**
     * Convert incoming packaging array to raw framework structure.
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
     * Process variant images deterministically using factory-driven image mappings.
     * This ensures images match perfectly across lookups even on a fresh migrate:fresh.
     */
    private function seedDeterministicVariantImages(Item $item, array $data): void
    {
        $item->load('variants');
        
        // Base starting baseline for variant images to distinguish them from the parent photo
        $variantPhotoSeedBase = $data['picsum_id'] + 300; 

        foreach ($item->variants as $vIndex => $variant) {
            // Generate a unique, deterministic photo ID per distinct item variant
            $pinnedVariantPicsumId = $variantPhotoSeedBase + $vIndex;

            // Use the factory's underlying download logic to stream images to your MinIO disk
            // temporarily creating a dummy model state to capture paths
            $dummyVariant = ItemVariant::factory()
                ->withPicsumId($pinnedVariantPicsumId)
                ->make();

            // Intercept paths generated by factory rules and push them directly onto your verified entity
            $variant->update([
                'images' => $dummyVariant->images // Contains matching verified MinIO asset strings
            ]);
        }
    }

    /**
     * Evaluate image counts per variant to move item past draft security walls.
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
            'status'        => $finalStatus,
            'is_incomplete' => !$allProven,
        ]);
    }
}