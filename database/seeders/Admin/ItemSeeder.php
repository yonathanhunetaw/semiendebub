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
        // 1
        [
            'product_name' => '2025 - 1',
            'product_description' => 'Premium quality distribution catalog ledger item for 2025.',
            'packaging_details' => 'Available in individual pieces, and master cartons of 96.',
            'item_category_id' => 45,    // Art Materials
            'status' => 'active',
            'picsum_id' => 201,
            'file_prefix' => '2025-1',
            'color_ids' => [5, 10],      // Black, Brown
            'size_ids' => [13],          // A5
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1600],
            ],
        ],
        // 2
        [
            'product_name' => '2025 - ብልጭልጭ',
            'product_description' => 'Premium quality distribution catalog ledger item for 2025 - ብልጭልጭ.',
            'packaging_details' => 'Available in individual pieces, boxes of 12, and master cartons of 120.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 202,
            'file_prefix' => '2025-ብልጭልጭ',
            'color_ids' => [5, 10],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 5, 'quantity' => 1, 'cbm' => 0.0015],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.2000],
            ],
        ],
        // 3
        [
            'product_name' => '25k - 1 ፓሪስ',
            'product_description' => 'Premium quality distribution catalog ledger item for 25k - 1 ፓሪስ.',
            'packaging_details' => 'Available in individual pieces, boxes of 12, and master cartons of 120.',
            'item_category_id' => 46,    // Oil Color (or appropriate notebook category)
            'status' => 'active',
            'picsum_id' => 203,
            'file_prefix' => '25k-1ፓሪስ',
            'color_ids' => [5, 10],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0008],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1100],
            ],
        ],
        // 4
        [
            'product_name' => '25k - 5 ጨርቅ ማስታወሻ',
            'product_description' => 'Premium quality distribution catalog ledger item for 25k - 5 ጨርቅ ማስታወሻ.',
            'packaging_details' => 'Available in individual pieces, boxes of 12, and master cartons of 120.',
            'item_category_id' => 46,
            'status' => 'active',
            'picsum_id' => 204,
            'file_prefix' => '25k-5ጨርቅማስታወሻ',
            'color_ids' => [5, 10],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0009],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1250],
            ],
        ],
        // 5
        [
            'product_name' => 'A3 - Paper Laola',
            'product_description' => 'Professional A3-sized Laola format binder for high-capacity document storage.',
            'packaging_details' => 'Available in bundles of 200 and master cartons of 5 bundles.',
            'item_category_id' => 56,    // Printer Paper A3
            'status' => 'active',
            'picsum_id' => 205,
            'file_prefix' => 'a3-paperlaola',
            'color_ids' => [6],          // White
            'size_ids' => [11],          // A3
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0025],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.2000],
            ],
        ],
        // 6
        [
            'product_name' => 'A3 - Road map',
            'product_description' => 'Specialized A3-sized road map ledger for logistics and navigation planning.',
            'packaging_details' => 'Available in individual pieces and master cartons of 100.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 206,
            'file_prefix' => 'a3-roadmap',
            'color_ids' => [1, 3],       // Red, Green
            'size_ids' => [11],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0020],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.2000],
            ],
        ],
        // 7
        [
            'product_name' => 'A4 - Binding file ዉዱ',
            'product_description' => 'Durable A4-sized binding file (ዉዱ) for secure archive and presentation.',
            'packaging_details' => 'Available in individual pieces, boxes of 12, and master cartons of 120.',
            'item_category_id' => 28,    // Binding
            'status' => 'active',
            'picsum_id' => 207,
            'file_prefix' => 'a4-binding-file-wudu',
            'color_ids' => [2, 5],       // Blue, Black
            'size_ids' => [12],          // A4
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0015],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1800],
            ],
        ],
        // 8
        [
            'product_name' => 'A4 - Gold on',
            'product_description' => 'Gold embossed A4 document folder.',
            'packaging_details' => 'Sold individually or in cartons of 100.',
            'item_category_id' => 20,    // Folder
            'status' => 'active',
            'picsum_id' => 208,
            'file_prefix' => 'a4-gold-on',
            'color_ids' => [5, 6],       // Black, White
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1300],
            ],
        ],
        // 9
        [
            'product_name' => 'A4 - Paper Laola',
            'product_description' => 'Standard A4 Laola paper ream.',
            'packaging_details' => 'Available in reams of 500 sheets and cartons of 5 reams.',
            'item_category_id' => 55,    // A4 Printer Paper
            'status' => 'active',
            'picsum_id' => 209,
            'file_prefix' => 'a4-paperlaola',
            'color_ids' => [6],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0030],
                ['item_packaging_type_id' => 3, 'quantity' => 500, 'cbm' => 0.3500],
            ],
        ],
        // 10
        [
            'product_name' => 'A4 - Post',
            'product_description' => 'A4 post binder for office use.',
            'packaging_details' => 'Individual or carton of 120.',
            'item_category_id' => 20,
            'status' => 'active',
            'picsum_id' => 210,
            'file_prefix' => 'a4-post',
            'color_ids' => [1, 2, 3],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1400],
            ],
        ],
        // 11
        [
            'product_name' => 'A5 - 10 ባለቀለበት',
            'product_description' => 'A5 ring binder with 10 rings.',
            'packaging_details' => 'Piece or carton of 100.',
            'item_category_id' => 13,    // A5 (NoteBook A5)
            'status' => 'active',
            'picsum_id' => 211,
            'file_prefix' => 'a5-10-balekelebet',
            'color_ids' => [1, 2, 3, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0009],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 12
        [
            'product_name' => 'A5 - 11 - 1 ጠንካራ ከቨር ያለዉ',
            'product_description' => 'A5 hard cover notebook.',
            'packaging_details' => 'Piece or carton of 80.',
            'item_category_id' => 13,
            'status' => 'active',
            'picsum_id' => 212,
            'file_prefix' => 'a5-11-hardcover',
            'color_ids' => [5, 6],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0011],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.0950],
            ],
        ],
        // 13
        [
            'product_name' => 'A5 - 12 ባለ ፓኬት',
            'product_description' => 'A5 packet-style notebook.',
            'packaging_details' => 'Packet of 10, carton of 200.',
            'item_category_id' => 13,
            'status' => 'active',
            'picsum_id' => 213,
            'file_prefix' => 'a5-12-packet',
            'color_ids' => [2, 3, 4],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 10, 'cbm' => 0.0080],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1800],
            ],
        ],
        // 14
        [
            'product_name' => 'A5 - 2 ባለ እስክርቢቶ',
            'product_description' => 'A5 notebook with pen holder.',
            'packaging_details' => 'Piece or box of 12.',
            'item_category_id' => 13,
            'status' => 'active',
            'picsum_id' => 214,
            'file_prefix' => 'a5-2-penholder',
            'color_ids' => [1, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0150],
            ],
        ],
        // 15
        [
            'product_name' => 'A5 - 5 ባለ ማብኔት ነጭ',
            'product_description' => 'A5 white magnetic closure notebook.',
            'packaging_details' => 'Piece or carton of 100.',
            'item_category_id' => 13,
            'status' => 'active',
            'picsum_id' => 215,
            'file_prefix' => 'a5-5-magnet-white',
            'color_ids' => [6],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1100],
            ],
        ],
        // 16
        [
            'product_name' => 'A5 - 8 ባለሳንቲም ባለእስክርቢቶ',
            'product_description' => 'A5 coin-style with pen.',
            'packaging_details' => 'Individual or dozen.',
            'item_category_id' => 13,
            'status' => 'active',
            'picsum_id' => 216,
            'file_prefix' => 'a5-8-coin-pen',
            'color_ids' => [8, 10],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0011],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0140],
            ],
        ],
        // 17
        [
            'product_name' => 'A5 - 9 ባለ ማግኔት ጌጥ',
            'product_description' => 'A5 decorative magnetic notebook.',
            'packaging_details' => 'Piece or carton of 120.',
            'item_category_id' => 13,
            'status' => 'active',
            'picsum_id' => 217,
            'file_prefix' => 'a5-9-magnet-deco',
            'color_ids' => [7, 9],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1300],
            ],
        ],
        // 18
        [
            'product_name' => 'A5 - ብልጭልጭ 25k - 9',
            'product_description' => 'Glitter A5 notebook 25k series.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 13,
            'status' => 'active',
            'picsum_id' => 218,
            'file_prefix' => 'a5-blichblich-25k-9',
            'color_ids' => [4, 8],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1100],
            ],
        ],
        // 19
        [
            'product_name' => 'A5 - ገመድ new',
            'product_description' => 'A5 new rope-bound notebook.',
            'packaging_details' => 'Individual or carton.',
            'item_category_id' => 13,
            'status' => 'active',
            'picsum_id' => 219,
            'file_prefix' => 'a5-gemed-new',
            'color_ids' => [1, 2, 3],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0009],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1200],
            ],
        ],
        // 20
        [
            'product_name' => 'A5 - ሳንቲም',
            'product_description' => 'A5 coin-bound notebook.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 13,
            'status' => 'active',
            'picsum_id' => 220,
            'file_prefix' => 'a5-santim',
            'color_ids' => [5, 10],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0130],
            ],
        ],
        // 21
        [
            'product_name' => 'A6 - 1 ባለ ገመድ',
            'product_description' => 'A6 rope-bound notebook.',
            'packaging_details' => 'Piece or carton of 200.',
            'item_category_id' => 14,    // A6
            'status' => 'active',
            'picsum_id' => 221,
            'file_prefix' => 'a6-1-gemed',
            'color_ids' => [5, 6],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1300],
            ],
        ],
        // 22
        [
            'product_name' => 'A6 - 1 ባለቁልፍ',
            'product_description' => 'A6 key-bound notebook.',
            'packaging_details' => 'Individual or carton.',
            'item_category_id' => 14,
            'status' => 'active',
            'picsum_id' => 222,
            'file_prefix' => 'a6-1-key',
            'color_ids' => [1, 2],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 3, 'quantity' => 180, 'cbm' => 0.1200],
            ],
        ],
        // 23
        [
            'product_name' => 'A6 - 2 ባለ ገመድ',
            'product_description' => 'A6 double rope notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 14,
            'status' => 'active',
            'picsum_id' => 223,
            'file_prefix' => 'a6-2-gemed',
            'color_ids' => [3, 4],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0007],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1400],
            ],
        ],
        // 24
        [
            'product_name' => 'A6 - 2 ባለ ገመድ ብልጭልጭ ያለዉ',
            'product_description' => 'A6 glitter rope notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 14,
            'status' => 'active',
            'picsum_id' => 224,
            'file_prefix' => 'a6-2-gemed-glitter',
            'color_ids' => [7, 8],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0007],
                ['item_packaging_type_id' => 3, 'quantity' => 180, 'cbm' => 0.1300],
            ],
        ],
        // 25
        [
            'product_name' => 'A6 - 3 ባለገመድ',
            'product_description' => 'A6 triple rope notebook.',
            'packaging_details' => 'Individual or carton.',
            'item_category_id' => 14,
            'status' => 'active',
            'picsum_id' => 225,
            'file_prefix' => 'a6-3-gemed',
            'color_ids' => [5, 9],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1300],
            ],
        ],
        // 26
        [
            'product_name' => 'A6 - ብልጭልጭ',
            'product_description' => 'A6 glitter notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 14,
            'status' => 'active',
            'picsum_id' => 226,
            'file_prefix' => 'a6-blichblich',
            'color_ids' => [4, 8],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0005],
                ['item_packaging_type_id' => 3, 'quantity' => 240, 'cbm' => 0.1300],
            ],
        ],
        // 27
        [
            'product_name' => 'A6 - ባለ ገመድ',
            'product_description' => 'Standard A6 rope notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 14,
            'status' => 'active',
            'picsum_id' => 227,
            'file_prefix' => 'a6-bale-gemed',
            'color_ids' => [2, 5],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1200],
            ],
        ],
        // 28
        [
            'product_name' => 'A6 - ቁልፍ የድሮ',
            'product_description' => 'Old style A6 key notebook.',
            'packaging_details' => 'Individual or box.',
            'item_category_id' => 14,
            'status' => 'active',
            'picsum_id' => 228,
            'file_prefix' => 'a6-key-old',
            'color_ids' => [10, 5],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0007],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0080],
            ],
        ],
        // 29
        [
            'product_name' => 'Acleric',
            'product_description' => 'Acleric clerical binder.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 20,    // Folder
            'status' => 'active',
            'picsum_id' => 229,
            'file_prefix' => 'acleric',
            'color_ids' => [6],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0015],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1600],
            ],
        ],
        // 30
        [
            'product_name' => 'Agenda አጀንዳ',
            'product_description' => 'Daily agenda planner.',
            'packaging_details' => 'Piece or carton of 50.',
            'item_category_id' => 4,     // Agenda
            'status' => 'active',
            'picsum_id' => 230,
            'file_prefix' => 'agenda',
            'color_ids' => [1, 2, 3, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 50, 'cbm' => 0.0550],
            ],
        ],
        // 31
        [
            'product_name' => 'Atlas Film አትላስ ፌልም',
            'product_description' => 'Atlas film for binding.',
            'packaging_details' => 'Roll or carton.',
            'item_category_id' => 28,
            'status' => 'active',
            'picsum_id' => 231,
            'file_prefix' => 'atlas-film',
            'color_ids' => [6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 5, 'quantity' => 1, 'cbm' => 0.0200],
                ['item_packaging_type_id' => 3, 'quantity' => 50, 'cbm' => 1.0000],
            ],
        ],
        // 32
        [
            'product_name' => 'B5 - 1 ባለማግኔት ጫፉ ነጭ',
            'product_description' => 'B5 white-tipped magnetic notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 32,    // B5 size (not in original matrix but assume 32 for B5)
            'status' => 'active',
            'picsum_id' => 232,
            'file_prefix' => 'b5-1-magnet-white',
            'color_ids' => [6],
            'size_ids' => [16],          // A8 placeholder – adjust if needed
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.1000],
            ],
        ],
        // 33
        [
            'product_name' => 'B5 - 1 ሳንቲም',
            'product_description' => 'B5 coin notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 32,
            'status' => 'active',
            'picsum_id' => 233,
            'file_prefix' => 'b5-1-santim',
            'color_ids' => [5, 10],
            'size_ids' => [16],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0011],
                ['item_packaging_type_id' => 3, 'quantity' => 90, 'cbm' => 0.1100],
            ],
        ],
        // 34
        [
            'product_name' => 'B5 - 2 ባለማግኔት ጌጥ',
            'product_description' => 'B5 decorative magnetic notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 32,
            'status' => 'active',
            'picsum_id' => 234,
            'file_prefix' => 'b5-2-magnet-deco',
            'color_ids' => [7, 9],
            'size_ids' => [16],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0013],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.1100],
            ],
        ],
        // 35
        [
            'product_name' => 'B5 - 3 ባለማግኔት ብረት',
            'product_description' => 'B5 metal magnetic notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 32,
            'status' => 'active',
            'picsum_id' => 235,
            'file_prefix' => 'b5-3-magnet-metal',
            'color_ids' => [5, 6],
            'size_ids' => [16],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0014],
                ['item_packaging_type_id' => 3, 'quantity' => 70, 'cbm' => 0.1050],
            ],
        ],
        // 36
        [
            'product_name' => 'B5 - 5 ቀጭን ሳንቲም',
            'product_description' => 'B5 thin coin notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 32,
            'status' => 'active',
            'picsum_id' => 236,
            'file_prefix' => 'b5-5-thin-coin',
            'color_ids' => [8, 10],
            'size_ids' => [16],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 37
        [
            'product_name' => 'B5 - ባለ ሳንቲም ኖርማል',
            'product_description' => 'B5 normal coin notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 32,
            'status' => 'active',
            'picsum_id' => 237,
            'file_prefix' => 'b5-coin-normal',
            'color_ids' => [1, 2],
            'size_ids' => [16],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0011],
                ['item_packaging_type_id' => 3, 'quantity' => 90, 'cbm' => 0.1100],
            ],
        ],
        // 38
        [
            'product_name' => 'B5 - ባለ ሳንቲም እስክርቢቶ ማስገቢያ ያለዉ',
            'product_description' => 'B5 coin notebook with pen slot.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 32,
            'status' => 'active',
            'picsum_id' => 238,
            'file_prefix' => 'b5-coin-penholder',
            'color_ids' => [3, 4],
            'size_ids' => [16],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0150],
            ],
        ],
        // 39
        [
            'product_name' => 'B5 - ሳንቲም',
            'product_description' => 'Basic B5 coin notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 32,
            'status' => 'active',
            'picsum_id' => 239,
            'file_prefix' => 'b5-santim',
            'color_ids' => [5, 6, 7],
            'size_ids' => [16],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1100],
            ],
        ],
        // 40
        [
            'product_name' => 'Bj ባለ 300 ብር',
            'product_description' => 'Budget notebook 300 Birr.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 9,     // Locally Made
            'status' => 'active',
            'picsum_id' => 240,
            'file_prefix' => 'bj-300birr',
            'color_ids' => [5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.1000],
            ],
        ],
        // 41
        [
            'product_name' => 'Box file - Black/Color',
            'product_description' => 'Box file in black or color.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 19,    // Box File
            'status' => 'active',
            'picsum_id' => 241,
            'file_prefix' => 'boxfile-black-color',
            'color_ids' => [1, 2, 3, 5],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0025],
                ['item_packaging_type_id' => 3, 'quantity' => 50, 'cbm' => 0.1300],
            ],
        ],
        // 42
        [
            'product_name' => 'Business Card ቢዝነስ ካርድ',
            'product_description' => 'Business card holder / paper.',
            'packaging_details' => 'Packet of 100.',
            'item_category_id' => 39,    // Envelope (or cards)
            'status' => 'active',
            'picsum_id' => 242,
            'file_prefix' => 'business-card',
            'color_ids' => [6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 100, 'cbm' => 0.0050],
                ['item_packaging_type_id' => 3, 'quantity' => 1000, 'cbm' => 0.0500],
            ],
        ],
        // 43
        [
            'product_name' => 'Cilp file',
            'product_description' => 'Clip file (clipboard style).',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 21,    // Clip file
            'status' => 'active',
            'picsum_id' => 243,
            'file_prefix' => 'cilp-file',
            'color_ids' => [1, 2, 5],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0018],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1900],
            ],
        ],
        // 44
        [
            'product_name' => 'ClipBoard',
            'product_description' => 'Standard clipboard.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 22,    // Clipboard
            'status' => 'active',
            'picsum_id' => 244,
            'file_prefix' => 'clipboard',
            'color_ids' => [5, 6],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0020],
                ['item_packaging_type_id' => 3, 'quantity' => 60, 'cbm' => 0.1200],
            ],
        ],
        // 45
        [
            'product_name' => 'ClipBoard - ክሊፕቦርድ ርካሹ',
            'product_description' => 'Budget clipboard.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 22,
            'status' => 'active',
            'picsum_id' => 245,
            'file_prefix' => 'clipboard-cheap',
            'color_ids' => [5],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0018],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.1500],
            ],
        ],
        // 46
        [
            'product_name' => 'Color - 2 side Color',
            'product_description' => 'Double-sided color sheets.',
            'packaging_details' => 'Packet of 50.',
            'item_category_id' => 45,    // Art Materials
            'status' => 'active',
            'picsum_id' => 246,
            'file_prefix' => 'color-2side',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 50, 'cbm' => 0.0100],
                ['item_packaging_type_id' => 3, 'quantity' => 500, 'cbm' => 0.1000],
            ],
        ],
        // 47
        [
            'product_name' => 'Color - Oil',
            'product_description' => 'Oil color set.',
            'packaging_details' => 'Box of 12/24.',
            'item_category_id' => 46,    // Oil Color
            'status' => 'active',
            'picsum_id' => 247,
            'file_prefix' => 'color-oil',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0200],
                ['item_packaging_type_id' => 4, 'quantity' => 24, 'cbm' => 0.0400],
                ['item_packaging_type_id' => 3, 'quantity' => 288, 'cbm' => 0.5000],
            ],
        ],
        // 48
        [
            'product_name' => 'Color - Piko ምሳቃ',
            'product_description' => 'Piko color set.',
            'packaging_details' => 'Box or packet.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 248,
            'file_prefix' => 'color-piko',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0150],
                ['item_packaging_type_id' => 3, 'quantity' => 240, 'cbm' => 0.3000],
            ],
        ],
        // 49
        [
            'product_name' => 'Color - ምሳቃ ከለር ተንጠልጣይ',
            'product_description' => 'Hanging color set.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 249,
            'file_prefix' => 'color-hanging',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0050],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.5000],
            ],
        ],
        // 50
        [
            'product_name' => 'Color - ዉሃ ከለር ውዱ ትልቁ',
            'product_description' => 'Large watercolor set.',
            'packaging_details' => 'Box or carton.',
            'item_category_id' => 45,    // Watercolor
            'status' => 'active',
            'picsum_id' => 250,
            'file_prefix' => 'color-watercolor-large',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 4, 'quantity' => 1, 'cbm' => 0.0300],
                ['item_packaging_type_id' => 3, 'quantity' => 48, 'cbm' => 1.4400],
            ],
        ],
        // 51
        [
            'product_name' => 'Color Bad - 2 pockets ክሊር ባግ ባለ 2 ኪስ',
            'product_description' => 'Clear bag with 2 pockets.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 20,
            'status' => 'active',
            'picsum_id' => 251,
            'file_prefix' => 'colorbag-2pockets',
            'color_ids' => [6],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0008],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1600],
            ],
        ],
        // 52
        [
            'product_name' => 'Color Bag - ክሊር ባግ ርካሹ',
            'product_description' => 'Budget clear bag.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 20,
            'status' => 'active',
            'picsum_id' => 252,
            'file_prefix' => 'colorbag-cheap',
            'color_ids' => [6],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0007],
                ['item_packaging_type_id' => 3, 'quantity' => 300, 'cbm' => 0.2100],
            ],
        ],
        // 53
        [
            'product_name' => 'Coloring Book',
            'product_description' => 'Children‘s coloring book.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 54,    // Drawing Book
            'status' => 'active',
            'picsum_id' => 253,
            'file_prefix' => 'coloring-book',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 54
        [
            'product_name' => 'Coloring Book - ባለ ብሩሽ',
            'product_description' => 'Coloring book with brush.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 54,
            'status' => 'active',
            'picsum_id' => 254,
            'file_prefix' => 'coloring-book-brush',
            'color_ids' => [1, 2, 3, 4, 5, 6],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.1000],
            ],
        ],
        // 55
        [
            'product_name' => 'Compass - 3009 ማይካ',
            'product_description' => 'Compass model 3009.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 53,    // Compass
            'status' => 'active',
            'picsum_id' => 255,
            'file_prefix' => 'compass-3009',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0005],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0060],
            ],
        ],
        // 56
        [
            'product_name' => 'Compass - 8005 ማይካ',
            'product_description' => 'Compass model 8005.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 53,
            'status' => 'active',
            'picsum_id' => 256,
            'file_prefix' => 'compass-8005',
            'color_ids' => [5],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0005],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0060],
            ],
        ],
        // 57
        [
            'product_name' => 'Compass - 8010',
            'product_description' => 'Compass model 8010.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 53,
            'status' => 'active',
            'picsum_id' => 257,
            'file_prefix' => 'compass-8010',
            'color_ids' => [5, 2],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0070],
            ],
        ],
        // 58
        [
            'product_name' => 'Compass - Color b',
            'product_description' => 'Colorful compass.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 53,
            'status' => 'active',
            'picsum_id' => 258,
            'file_prefix' => 'compass-color',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0005],
                ['item_packaging_type_id' => 4, 'quantity' => 24, 'cbm' => 0.0120],
            ],
        ],
        // 59
        [
            'product_name' => 'Compass - Marshale',
            'product_description' => 'Marshale brand compass.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 53,
            'status' => 'active',
            'picsum_id' => 259,
            'file_prefix' => 'compass-marshale',
            'color_ids' => [5],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0007],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0080],
            ],
        ],
        // 60
        [
            'product_name' => 'Compass - ቆርቆሮ ኮምፓስ',
            'product_description' => 'Tin compass.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 53,
            'status' => 'active',
            'picsum_id' => 260,
            'file_prefix' => 'compass-tin',
            'color_ids' => [5, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0008],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1000],
            ],
        ],
        // 61
        [
            'product_name' => 'Compass - ጥቁር ኮምፓስ',
            'product_description' => 'Black compass.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 53,
            'status' => 'active',
            'picsum_id' => 261,
            'file_prefix' => 'compass-black',
            'color_ids' => [5],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0005],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0060],
            ],
        ],
        // 62
        [
            'product_name' => 'Compass - ፕላስቲክ 5007',
            'product_description' => 'Plastic compass 5007.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 53,
            'status' => 'active',
            'picsum_id' => 262,
            'file_prefix' => 'compass-plastic-5007',
            'color_ids' => [1, 2, 3],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0004],
                ['item_packaging_type_id' => 4, 'quantity' => 24, 'cbm' => 0.0100],
            ],
        ],
        // 63
        [
            'product_name' => 'Crayon - Normal',
            'product_description' => 'Standard crayons.',
            'packaging_details' => 'Box of 12/24.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 263,
            'file_prefix' => 'crayon-normal',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0080],
                ['item_packaging_type_id' => 4, 'quantity' => 24, 'cbm' => 0.0160],
            ],
        ],
        // 64
        [
            'product_name' => 'Crayon - ምሳቃ ከለር በእቃ',
            'product_description' => 'Crayon set with container.',
            'packaging_details' => 'Box or carton.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 264,
            'file_prefix' => 'crayon-container',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 4, 'quantity' => 1, 'cbm' => 0.0120],
                ['item_packaging_type_id' => 3, 'quantity' => 48, 'cbm' => 0.6000],
            ],
        ],
        // 65
        [
            'product_name' => 'Cutter - Small ከተር ትልቁ',
            'product_description' => 'Large cutter.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 28,
            'status' => 'active',
            'picsum_id' => 265,
            'file_prefix' => 'cutter-large',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0005],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0060],
            ],
        ],
        // 66
        [
            'product_name' => 'Cutter - Small ከተር ትንሹ',
            'product_description' => 'Small cutter.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 28,
            'status' => 'active',
            'picsum_id' => 266,
            'file_prefix' => 'cutter-small',
            'color_ids' => [5],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0003],
                ['item_packaging_type_id' => 4, 'quantity' => 24, 'cbm' => 0.0070],
            ],
        ],
        // 67
        [
            'product_name' => 'Diary - Code ዲያሪ ኮድ',
            'product_description' => 'Code diary.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 4,
            'status' => 'active',
            'picsum_id' => 267,
            'file_prefix' => 'diary-code',
            'color_ids' => [1, 2, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.0800],
            ],
        ],
        // 68
        [
            'product_name' => 'Diary - Small ዲያሪ ትንሹ',
            'product_description' => 'Small diary.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 4,
            'status' => 'active',
            'picsum_id' => 268,
            'file_prefix' => 'diary-small',
            'color_ids' => [1, 2, 3, 4],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1200],
            ],
        ],
        // 69
        [
            'product_name' => 'Diary - ዲያሪ ፍሩት',
            'product_description' => 'Fruit diary.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 4,
            'status' => 'active',
            'picsum_id' => 269,
            'file_prefix' => 'diary-fruit',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 70
        [
            'product_name' => 'Diary - ዲያሪ የተለያየ',
            'product_description' => 'Assorted diary.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 4,
            'status' => 'active',
            'picsum_id' => 270,
            'file_prefix' => 'diary-assorted',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [13, 14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0009],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.0900],
            ],
        ],
        // 71
        [
            'product_name' => 'Dispencer big/Medium/small ዲስፔስር',
            'product_description' => 'Dispenser (big/medium/small).',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 31,    // Tape Dispenser
            'status' => 'active',
            'picsum_id' => 271,
            'file_prefix' => 'dispencer',
            'color_ids' => [5, 6],
            'size_ids' => [6, 7, 8],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 60, 'cbm' => 0.0600],
            ],
        ],
        // 72
        [
            'product_name' => 'Display book - 100',
            'product_description' => 'Display book for 100 sheets.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 24,    // Display book
            'status' => 'active',
            'picsum_id' => 272,
            'file_prefix' => 'displaybook-100',
            'color_ids' => [1, 2, 3, 5],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0020],
                ['item_packaging_type_id' => 3, 'quantity' => 40, 'cbm' => 0.0800],
            ],
        ],
        // 73
        [
            'product_name' => 'Display book - 40',
            'product_description' => 'Display book for 40 sheets.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 24,
            'status' => 'active',
            'picsum_id' => 273,
            'file_prefix' => 'displaybook-40',
            'color_ids' => [1, 2, 3, 5],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0015],
                ['item_packaging_type_id' => 3, 'quantity' => 60, 'cbm' => 0.0900],
            ],
        ],
        // 74
        [
            'product_name' => 'Display book - 60',
            'product_description' => 'Display book for 60 sheets.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 24,
            'status' => 'active',
            'picsum_id' => 274,
            'file_prefix' => 'displaybook-60',
            'color_ids' => [1, 2, 3, 5],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0018],
                ['item_packaging_type_id' => 3, 'quantity' => 50, 'cbm' => 0.0900],
            ],
        ],
        // 75
        [
            'product_name' => 'Display book - 80',
            'product_description' => 'Display book for 80 sheets.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 24,
            'status' => 'active',
            'picsum_id' => 275,
            'file_prefix' => 'displaybook-80',
            'color_ids' => [1, 2, 3, 5],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0019],
                ['item_packaging_type_id' => 3, 'quantity' => 45, 'cbm' => 0.0850],
            ],
        ],
        // 76
        [
            'product_name' => 'Document Case',
            'product_description' => 'Document carrying case.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 23,    // Document Case
            'status' => 'active',
            'picsum_id' => 276,
            'file_prefix' => 'document-case',
            'color_ids' => [5, 6, 1, 2],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0030],
                ['item_packaging_type_id' => 3, 'quantity' => 30, 'cbm' => 0.0900],
            ],
        ],
        // 77
        [
            'product_name' => 'Drawing Book - Long የስዕል ደብተር ረጅሙ',
            'product_description' => 'Long drawing book.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 54,
            'status' => 'active',
            'picsum_id' => 277,
            'file_prefix' => 'drawingbook-long',
            'color_ids' => [6],
            'size_ids' => [10],          // A2 approx
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0020],
                ['item_packaging_type_id' => 3, 'quantity' => 50, 'cbm' => 0.1000],
            ],
        ],
        // 78
        [
            'product_name' => 'Drawing Book - Short የስዕል ደብተር አጭሩ',
            'product_description' => 'Short drawing book.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 54,
            'status' => 'active',
            'picsum_id' => 278,
            'file_prefix' => 'drawingbook-short',
            'color_ids' => [6],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1200],
            ],
        ],
        // 79
        [
            'product_name' => 'Elastic Band - የብር ላስቲክ',
            'product_description' => 'Silver elastic band.',
            'packaging_details' => 'Packet or carton.',
            'item_category_id' => 29,    // Elastic band
            'status' => 'active',
            'picsum_id' => 279,
            'file_prefix' => 'elastic-silver',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 10, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 500, 'cbm' => 0.0500],
            ],
        ],
        // 80
        [
            'product_name' => 'Erasor Shaped ላጲስ ባለቅርፅ',
            'product_description' => 'Shaped eraser.',
            'packaging_details' => 'Packet or carton.',
            'item_category_id' => 14,    // Eraser
            'status' => 'active',
            'picsum_id' => 280,
            'file_prefix' => 'eraser-shaped',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 20, 'cbm' => 0.0020],
                ['item_packaging_type_id' => 3, 'quantity' => 1000, 'cbm' => 0.1000],
            ],
        ],
        // 81
        [
            'product_name' => 'Eyeye Pan',
            'product_description' => 'Eyeye pan (art supply).',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 281,
            'file_prefix' => 'eyeye-pan',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.2000],
            ],
        ],
        // 82
        [
            'product_name' => 'Fastener',
            'product_description' => 'Paper fastener.',
            'packaging_details' => 'Packet of 100.',
            'item_category_id' => 28,    // Fastener
            'status' => 'active',
            'picsum_id' => 282,
            'file_prefix' => 'fastener',
            'color_ids' => [5, 6, 1, 2, 3],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 100, 'cbm' => 0.0050],
                ['item_packaging_type_id' => 3, 'quantity' => 1000, 'cbm' => 0.0500],
            ],
        ],
        // 83
        [
            'product_name' => 'Fixer (0.5/0.7) ፊክሰር (5/7) ቁጥር',
            'product_description' => 'Fixer for mechanical pencils (0.5/0.7).',
            'packaging_details' => 'Packet or carton.',
            'item_category_id' => 15,    // Sharpener (or fixer)
            'status' => 'active',
            'picsum_id' => 283,
            'file_prefix' => 'fixer',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 10, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 500, 'cbm' => 0.0500],
            ],
        ],
        // 84
        [
            'product_name' => 'Flexible 20cm',
            'product_description' => '20cm flexible ruler.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 35,    // Ruler
            'status' => 'active',
            'picsum_id' => 284,
            'file_prefix' => 'flexible-20cm',
            'color_ids' => [1, 2, 3, 4, 5, 6],
            'size_ids' => [20],          // 8mm placeholder
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0003],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0040],
            ],
        ],
        // 85
        [
            'product_name' => 'Fluid Normal',
            'product_description' => 'Normal correction fluid.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 18,    // Fluid
            'status' => 'active',
            'picsum_id' => 285,
            'file_prefix' => 'fluid-normal',
            'color_ids' => [6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0002],
                ['item_packaging_type_id' => 3, 'quantity' => 240, 'cbm' => 0.0480],
            ],
        ],
        // 86
        [
            'product_name' => 'Folder - 12 pockets ፎልበር 12 ኪስ',
            'product_description' => 'Folder with 12 pockets.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 20,
            'status' => 'active',
            'picsum_id' => 286,
            'file_prefix' => 'folder-12pockets',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1200],
            ],
        ],
        // 87
        [
            'product_name' => 'Folder - 7 Pockets ባለ 7 ኪስ ፎልደር',
            'product_description' => 'Folder with 7 pockets.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 20,
            'status' => 'active',
            'picsum_id' => 287,
            'file_prefix' => 'folder-7pockets',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.1200],
            ],
        ],
        // 88
        [
            'product_name' => 'Folder with rough texture ሸካራ ፎልደር',
            'product_description' => 'Rough texture folder.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 20,
            'status' => 'active',
            'picsum_id' => 288,
            'file_prefix' => 'folder-rough',
            'color_ids' => [5, 10],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0011],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1100],
            ],
        ],
        // 89
        [
            'product_name' => 'Globe ግሎብ',
            'product_description' => 'Educational globe.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 32,    // Globe
            'status' => 'active',
            'picsum_id' => 289,
            'file_prefix' => 'globe',
            'color_ids' => [1, 2, 3, 4, 5, 6],
            'size_ids' => [6, 7, 8],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0100],
                ['item_packaging_type_id' => 3, 'quantity' => 20, 'cbm' => 0.2000],
            ],
        ],
        // 90
        [
            'product_name' => 'Hand Writing',
            'product_description' => 'Handwriting practice book.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 1,     // Subject / Notebook
            'status' => 'active',
            'picsum_id' => 290,
            'file_prefix' => 'handwriting',
            'color_ids' => [5, 6],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 91
        [
            'product_name' => 'Hard Cover',
            'product_description' => 'Hard cover notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 2,     // NoteBook 18k
            'status' => 'active',
            'picsum_id' => 291,
            'file_prefix' => 'hard-cover',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.0960],
            ],
        ],
        // 92
        [
            'product_name' => 'Laminating 65*95',
            'product_description' => 'Laminating film 65x95mm.',
            'packaging_details' => 'Packet of 100.',
            'item_category_id' => 25,    // Binding / laminating
            'status' => 'active',
            'picsum_id' => 292,
            'file_prefix' => 'laminating-65x95',
            'color_ids' => [6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 100, 'cbm' => 0.0100],
                ['item_packaging_type_id' => 3, 'quantity' => 1000, 'cbm' => 0.1000],
            ],
        ],
        // 93
        [
            'product_name' => 'Laminating 76*106',
            'product_description' => 'Laminating film 76x106mm.',
            'packaging_details' => 'Packet of 100.',
            'item_category_id' => 25,
            'status' => 'active',
            'picsum_id' => 293,
            'file_prefix' => 'laminating-76x106',
            'color_ids' => [6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 100, 'cbm' => 0.0120],
                ['item_packaging_type_id' => 3, 'quantity' => 1000, 'cbm' => 0.1200],
            ],
        ],
        // 94
        [
            'product_name' => 'Laminating A3',
            'product_description' => 'A3 laminating film.',
            'packaging_details' => 'Packet of 50.',
            'item_category_id' => 25,
            'status' => 'active',
            'picsum_id' => 294,
            'file_prefix' => 'laminating-a3',
            'color_ids' => [6],
            'size_ids' => [11],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 50, 'cbm' => 0.0150],
                ['item_packaging_type_id' => 3, 'quantity' => 500, 'cbm' => 0.1500],
            ],
        ],
        // 95
        [
            'product_name' => 'Lead (0.5/0.7) ሊድ (0.5/0.7) ቁጥር',
            'product_description' => 'Lead refills for mechanical pencils.',
            'packaging_details' => 'Packet of 12 leads.',
            'item_category_id' => 12,    // Writing tools
            'status' => 'active',
            'picsum_id' => 295,
            'file_prefix' => 'lead',
            'color_ids' => [5],
            'size_ids' => [19, 20],      // 6mm/8mm as placeholder
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 12, 'cbm' => 0.0005],
                ['item_packaging_type_id' => 3, 'quantity' => 1000, 'cbm' => 0.0500],
            ],
        ],
        // 96
        [
            'product_name' => 'Magazine Rack - ማጋዚን ራክ የሚገጠም',
            'product_description' => 'Wall-mounted magazine rack.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 30,    // Paper tray / rack
            'status' => 'active',
            'picsum_id' => 296,
            'file_prefix' => 'magazine-rack-wall',
            'color_ids' => [5, 6, 1, 2],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0050],
                ['item_packaging_type_id' => 3, 'quantity' => 20, 'cbm' => 0.1000],
            ],
        ],
        // 97
        [
            'product_name' => 'Magazine Rack - መጋዘን ራክ የተበተነ',
            'product_description' => 'Freestanding magazine rack.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 30,
            'status' => 'active',
            'picsum_id' => 297,
            'file_prefix' => 'magazine-rack-free',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0080],
                ['item_packaging_type_id' => 3, 'quantity' => 15, 'cbm' => 0.1200],
            ],
        ],
        // 98
        [
            'product_name' => 'Marker - (1/2) Side',
            'product_description' => 'Single or double-sided marker.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 16,    // Marker
            'status' => 'active',
            'picsum_id' => 298,
            'file_prefix' => 'marker-1-2-side',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0003],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0040],
            ],
        ],
        // 99
        [
            'product_name' => 'Marker - White Board',
            'product_description' => 'Whiteboard marker.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 16,
            'status' => 'active',
            'picsum_id' => 299,
            'file_prefix' => 'marker-whiteboard',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0003],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0040],
            ],
        ],
        // 100
        [
            'product_name' => 'Marker - Yuanyuan',
            'product_description' => 'Yuanyuan brand marker.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 16,
            'status' => 'active',
            'picsum_id' => 300,
            'file_prefix' => 'marker-yuanyuan',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0004],
                ['item_packaging_type_id' => 4, 'quantity' => 10, 'cbm' => 0.0040],
            ],
        ],
        // 101
        [
            'product_name' => 'NoteBook - ማስታወሻ እንጨት',
            'product_description' => 'Wooden notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 2,
            'status' => 'active',
            'picsum_id' => 301,
            'file_prefix' => 'notebook-wooden',
            'color_ids' => [10, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0015],
                ['item_packaging_type_id' => 3, 'quantity' => 60, 'cbm' => 0.0900],
            ],
        ],
        // 102
        [
            'product_name' => 'NoteBook - ጥጥ ማስታወሻ',
            'product_description' => 'Cotton notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 2,
            'status' => 'active',
            'picsum_id' => 302,
            'file_prefix' => 'notebook-cotton',
            'color_ids' => [6, 1, 2, 3],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.0960],
            ],
        ],
        // 103
        [
            'product_name' => 'NoteBook 18k - Black ማስታወሻ 18k ጥቁር',
            'product_description' => '18k black notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 2,
            'status' => 'active',
            'picsum_id' => 303,
            'file_prefix' => 'notebook-18k-black',
            'color_ids' => [5],
            'size_ids' => [17],          // A9 placeholder
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0008],
                ['item_packaging_type_id' => 3, 'quantity' => 120, 'cbm' => 0.0960],
            ],
        ],
        // 104
        [
            'product_name' => 'NoteBook 25k - Leather Expensive ማስታወሻ 25k ሌዘር ዉዱ',
            'product_description' => 'Expensive leather 25k notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 3,
            'status' => 'active',
            'picsum_id' => 304,
            'file_prefix' => 'notebook-25k-leather',
            'color_ids' => [5, 10, 1, 2],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0015],
                ['item_packaging_type_id' => 3, 'quantity' => 50, 'cbm' => 0.0750],
            ],
        ],
        // 105
        [
            'product_name' => 'NoteBook 32k - Color',
            'product_description' => '32k color notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 5,
            'status' => 'active',
            'picsum_id' => 305,
            'file_prefix' => 'notebook-32k-color',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [18],          // A10 placeholder
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0007],
                ['item_packaging_type_id' => 3, 'quantity' => 150, 'cbm' => 0.1050],
            ],
        ],
        // 106
        [
            'product_name' => 'NoteBook 32k - Normal ማስታወሻ 32k normal',
            'product_description' => 'Normal 32k notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 5,
            'status' => 'active',
            'picsum_id' => 306,
            'file_prefix' => 'notebook-32k-normal',
            'color_ids' => [5, 6],
            'size_ids' => [18],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1200],
            ],
        ],
        // 107
        [
            'product_name' => 'NoteBook 32k - ጥቁር',
            'product_description' => 'Black 32k notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 5,
            'status' => 'active',
            'picsum_id' => 307,
            'file_prefix' => 'notebook-32k-black',
            'color_ids' => [5],
            'size_ids' => [18],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1200],
            ],
        ],
        // 108
        [
            'product_name' => 'NoteBook 60k - ማስታወሻ 60k',
            'product_description' => '60k notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 6,
            'status' => 'active',
            'picsum_id' => 308,
            'file_prefix' => 'notebook-60k',
            'color_ids' => [5, 6, 1, 2, 3],
            'size_ids' => [15],          // A7 placeholder
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0005],
                ['item_packaging_type_id' => 3, 'quantity' => 240, 'cbm' => 0.1200],
            ],
        ],
        // 109
        [
            'product_name' => 'NoteBook A4 - ማስታወሻ A4 መዝገብ 200',
            'product_description' => 'A4 notebook 200 pages.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 7,
            'status' => 'active',
            'picsum_id' => 309,
            'file_prefix' => 'notebook-a4-200',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0020],
                ['item_packaging_type_id' => 3, 'quantity' => 60, 'cbm' => 0.1200],
            ],
        ],
        // 110
        [
            'product_name' => 'NoteBook A5 - 1 ማስታወሻ A5-1 ባለ ማግኔት',
            'product_description' => 'A5 magnetic notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 8,
            'status' => 'active',
            'picsum_id' => 310,
            'file_prefix' => 'notebook-a5-1-magnet',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 111
        [
            'product_name' => 'NoteBook A5 - 6 Magnet Metal ማስታወሻ A5- 6 ጫፉ ነጭ ብረት ማግኔት',
            'product_description' => 'A5 metal magnetic notebook white tip.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 8,
            'status' => 'active',
            'picsum_id' => 311,
            'file_prefix' => 'notebook-a5-6-metal-magnet',
            'color_ids' => [6, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0011],
                ['item_packaging_type_id' => 3, 'quantity' => 90, 'cbm' => 0.0990],
            ],
        ],
        // 112
        [
            'product_name' => 'NoteBook A5 - 7 Magnet Metal ማስታወሻ A5-7 ብረት ማግኔት',
            'product_description' => 'A5 metal magnetic notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 8,
            'status' => 'active',
            'picsum_id' => 312,
            'file_prefix' => 'notebook-a5-7-metal-magnet',
            'color_ids' => [5, 6, 1, 2],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0011],
                ['item_packaging_type_id' => 3, 'quantity' => 90, 'cbm' => 0.0990],
            ],
        ],
        // 113
        [
            'product_name' => 'NoteBook A5 - Magnet New ማስታወሻ A5 ማግኔት new',
            'product_description' => 'New A5 magnetic notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 8,
            'status' => 'active',
            'picsum_id' => 313,
            'file_prefix' => 'notebook-a5-magnet-new',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 114
        [
            'product_name' => 'NoteBook A5 - Metal Magnet ማስታወሻ A5 ብረት ማግኔት',
            'product_description' => 'A5 metal magnet notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 8,
            'status' => 'active',
            'picsum_id' => 314,
            'file_prefix' => 'notebook-a5-metal-magnet',
            'color_ids' => [5, 6],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.0960],
            ],
        ],
        // 115
        [
            'product_name' => 'NoteBook A5 - Paris ማስታወሻ A5 ፓሪስ',
            'product_description' => 'A5 Paris notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 8,
            'status' => 'active',
            'picsum_id' => 315,
            'file_prefix' => 'notebook-a5-paris',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 116
        [
            'product_name' => 'NoteBook A5 - ማስታወሻ A5 ባለ new ገመድ',
            'product_description' => 'A5 new rope notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 8,
            'status' => 'active',
            'picsum_id' => 316,
            'file_prefix' => 'notebook-a5-new-rope',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 117
        [
            'product_name' => 'NoteBook A5 - ማስታወሻ A5 ባለ new ማግኔት',
            'product_description' => 'A5 new magnet notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 8,
            'status' => 'active',
            'picsum_id' => 317,
            'file_prefix' => 'notebook-a5-new-magnet',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 118
        [
            'product_name' => 'NoteBook A6 - 100 ማስታወሻ A6 100',
            'product_description' => 'A6 100-page notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 14,
            'status' => 'active',
            'picsum_id' => 318,
            'file_prefix' => 'notebook-a6-100',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1200],
            ],
        ],
        // 119
        [
            'product_name' => 'NoteBook A6 - Magnet New ማስታወሻ A6 ማግኔት new',
            'product_description' => 'New A6 magnetic notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 14,
            'status' => 'active',
            'picsum_id' => 319,
            'file_prefix' => 'notebook-a6-magnet-new',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1200],
            ],
        ],
        // 120
        [
            'product_name' => 'NoteBook A6 - Ribbon ማስታወሻ A6 ገመድ የድሮ',
            'product_description' => 'Old style A6 ribbon notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 14,
            'status' => 'active',
            'picsum_id' => 320,
            'file_prefix' => 'notebook-a6-ribbon-old',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1200],
            ],
        ],
        // 121
        [
            'product_name' => 'NoteBook A6 - ማስታወሻ A6 ባለ 1 ለእስክርቢቶ',
            'product_description' => 'A6 notebook with pen holder.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 14,
            'status' => 'active',
            'picsum_id' => 321,
            'file_prefix' => 'notebook-a6-penholder',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [14],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0007],
                ['item_packaging_type_id' => 3, 'quantity' => 180, 'cbm' => 0.1260],
            ],
        ],
        // 122
        [
            'product_name' => 'NoteBook B5 - 2 with pen ማስታወሻ B5-2 ባለ እስክርቢቶ',
            'product_description' => 'B5 notebook with pen.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 32,
            'status' => 'active',
            'picsum_id' => 322,
            'file_prefix' => 'notebook-b5-2-pen',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [16],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 80, 'cbm' => 0.0960],
            ],
        ],
        // 123
        [
            'product_name' => 'NoteBook B5 - 4 Magnet Metal ማስታወሻ B5-4 ማግኔት ብረት',
            'product_description' => 'B5 metal magnetic notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 32,
            'status' => 'active',
            'picsum_id' => 323,
            'file_prefix' => 'notebook-b5-4-metal-magnet',
            'color_ids' => [5, 6],
            'size_ids' => [16],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0013],
                ['item_packaging_type_id' => 3, 'quantity' => 75, 'cbm' => 0.0975],
            ],
        ],
        // 124
        [
            'product_name' => 'NoteBook B5 - Old ማስታወሻ የድሮ',
            'product_description' => 'Old B5 notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 32,
            'status' => 'active',
            'picsum_id' => 324,
            'file_prefix' => 'notebook-b5-old',
            'color_ids' => [10, 5],
            'size_ids' => [16],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0011],
                ['item_packaging_type_id' => 3, 'quantity' => 90, 'cbm' => 0.0990],
            ],
        ],
        // 125
        [
            'product_name' => 'Notebook - 9*7',
            'product_description' => '9x7 inch notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 1,
            'status' => 'active',
            'picsum_id' => 325,
            'file_prefix' => 'notebook-9x7',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [3],           // 5x5 inch approx
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 126
        [
            'product_name' => 'Notebook A5 - ማስታወሻ ባለ ዉሃ',
            'product_description' => 'A5 water-resistant notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 8,
            'status' => 'active',
            'picsum_id' => 326,
            'file_prefix' => 'notebook-a5-water',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0011],
                ['item_packaging_type_id' => 3, 'quantity' => 90, 'cbm' => 0.0990],
            ],
        ],
        // 127  (Existing 'Noteit' moved here)
        [
            'product_name' => 'Noteit - (3*3/3*4/3*5)',
            'product_description' => 'Premium Noteit ledger item with multi-dimensional grid layout bindings.',
            'packaging_details' => 'Distributed in individual pieces, dozens, and master cartons of 240 units.',
            'item_category_id' => 46,
            'status' => 'active',
            'picsum_id' => 201,
            'file_prefix' => 'noteit',
            'color_ids' => [11],
            'size_ids' => [1, 2, 3],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0150],
                ['item_packaging_type_id' => 3, 'quantity' => 240, 'cbm' => 0.3100],
            ],
        ],
        // 128
        [
            'product_name' => 'Office Pin',
            'product_description' => 'Office pins.',
            'packaging_details' => 'Box of 100.',
            'item_category_id' => 42,    // Paper Clips (or pins)
            'status' => 'active',
            'picsum_id' => 327,
            'file_prefix' => 'office-pin',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 4, 'quantity' => 100, 'cbm' => 0.0020],
                ['item_packaging_type_id' => 3, 'quantity' => 1000, 'cbm' => 0.0200],
            ],
        ],
        // 129
        [
            'product_name' => 'Paint Brush የስዕል ብሩሽ',
            'product_description' => 'Paint brush for art.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 47,    // Paint Brush
            'status' => 'active',
            'picsum_id' => 328,
            'file_prefix' => 'paint-brush',
            'color_ids' => [5, 10],
            'size_ids' => [5, 6, 7, 8],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0002],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0030],
            ],
        ],
        // 130
        [
            'product_name' => 'Paper Tray - (2/3) ማይካ',
            'product_description' => 'Paper tray 2 or 3 sections.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 30,
            'status' => 'active',
            'picsum_id' => 329,
            'file_prefix' => 'paper-tray-2-3',
            'color_ids' => [5, 6, 1, 2, 3],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0030],
                ['item_packaging_type_id' => 3, 'quantity' => 40, 'cbm' => 0.1200],
            ],
        ],
        // 131
        [
            'product_name' => 'Paper Tray - 3 ብረት 2001',
            'product_description' => 'Metal paper tray 2001.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 30,
            'status' => 'active',
            'picsum_id' => 330,
            'file_prefix' => 'paper-tray-3-metal',
            'color_ids' => [5, 6],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0040],
                ['item_packaging_type_id' => 3, 'quantity' => 30, 'cbm' => 0.1200],
            ],
        ],
        // 132  (Existing 'Bic' moved here)
        [
            'product_name' => 'Pen - Bic Pen - (Black/Blue/Red) ቢክ እስኪብርቶ - (ጥቁር/ሰማያዊ/ቀይ)',
            'product_description' => 'Classic fine-point industrial high-fluid retail ballpoint pen lines.',
            'packaging_details' => 'Sold in individual pieces, intermediate packets of 50, or master cases of 1000.',
            'item_category_id' => 12,
            'status' => 'active',
            'picsum_id' => 203,
            'file_prefix' => 'bic',
            'color_ids' => [2, 5, 1],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0003],
                ['item_packaging_type_id' => 2, 'quantity' => 50, 'cbm' => 0.0160],
                ['item_packaging_type_id' => 3, 'quantity' => 1000, 'cbm' => 0.3400],
            ],
        ],
        // 133
        [
            'product_name' => 'Pen - Box Hello',
            'product_description' => 'Hello box pen set.',
            'packaging_details' => 'Box of 10.',
            'item_category_id' => 12,
            'status' => 'active',
            'picsum_id' => 331,
            'file_prefix' => 'pen-box-hello',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 4, 'quantity' => 10, 'cbm' => 0.0050],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1000],
            ],
        ],
        // 134
        [
            'product_name' => 'Pen - Diamond ዳይመንድ እስኪብርቶ',
            'product_description' => 'Diamond pen.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 11,    // Diamond pen
            'status' => 'active',
            'picsum_id' => 332,
            'file_prefix' => 'pen-diamond',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0004],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0050],
            ],
        ],
        // 135
        [
            'product_name' => 'Pencil - Color 2 sided',
            'product_description' => 'Double-sided color pencil.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 13,    // Pencil Colored
            'status' => 'active',
            'picsum_id' => 333,
            'file_prefix' => 'pencil-color-2sided',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0002],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0030],
            ],
        ],
        // 136
        [
            'product_name' => 'Pencil - Color እርሳስ ከለር አጭሩ',
            'product_description' => 'Short color pencil.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 13,
            'status' => 'active',
            'picsum_id' => 334,
            'file_prefix' => 'pencil-color-short',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0002],
                ['item_packaging_type_id' => 4, 'quantity' => 24, 'cbm' => 0.0050],
            ],
        ],
        // 137
        [
            'product_name' => 'Pencil - Nann እርሳስ',
            'product_description' => 'Nann pencil.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 12,    // Pencil
            'status' => 'active',
            'picsum_id' => 335,
            'file_prefix' => 'pencil-nann',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0002],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0025],
            ],
        ],
        // 138
        [
            'product_name' => 'Pencil - Vneeds እርሳስ',
            'product_description' => 'Vneeds pencil.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 12,
            'status' => 'active',
            'picsum_id' => 336,
            'file_prefix' => 'pencil-vneeds',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0002],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0025],
            ],
        ],
        // 139
        [
            'product_name' => 'Pencil - እርሳስ ባለ እቃ',
            'product_description' => 'Pencil with container.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 12,
            'status' => 'active',
            'picsum_id' => 337,
            'file_prefix' => 'pencil-container',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0004],
                ['item_packaging_type_id' => 4, 'quantity' => 10, 'cbm' => 0.0040],
            ],
        ],
        // 140
        [
            'product_name' => 'Pencil - እርሳስ የስዕል ቁጥሩ የተለያየ',
            'product_description' => 'Drawing pencil various grades.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 12,
            'status' => 'active',
            'picsum_id' => 338,
            'file_prefix' => 'pencil-drawing-grades',
            'color_ids' => [5, 6, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0002],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0030],
            ],
        ],
        // 141
        [
            'product_name' => 'Pencil - ጥቁር የስዕል እርሳስ',
            'product_description' => 'Black drawing pencil.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 12,
            'status' => 'active',
            'picsum_id' => 339,
            'file_prefix' => 'pencil-drawing-black',
            'color_ids' => [5],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0002],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0025],
            ],
        ],
        // 142
        [
            'product_name' => 'Pencil Bag - ሸራ ፔንስል ባግ',
            'product_description' => 'Canvas pencil bag.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 20,
            'status' => 'active',
            'picsum_id' => 340,
            'file_prefix' => 'pencil-bag-canvas',
            'color_ids' => [1, 2, 3, 4, 5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0008],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.0800],
            ],
        ],
        // 143
        [
            'product_name' => 'Pencil Bag - ፔንስል ባግ ማይካ ባለ መቅተጫ',
            'product_description' => 'Plastic pencil bag with zipper.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 20,
            'status' => 'active',
            'picsum_id' => 341,
            'file_prefix' => 'pencil-bag-plastic-zipper',
            'color_ids' => [1, 2, 3, 4, 5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 3, 'quantity' => 150, 'cbm' => 0.0900],
            ],
        ],
        // 144
        [
            'product_name' => 'Pencil Bag - ፔንስል ባግ ሻራ ጠንካራዉ',
            'product_description' => 'Strong fabric pencil bag.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 20,
            'status' => 'active',
            'picsum_id' => 342,
            'file_prefix' => 'pencil-bag-strong',
            'color_ids' => [5, 6, 1, 2],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0009],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.0900],
            ],
        ],
        // 145
        [
            'product_name' => 'Plaster Cutter የእጅ ፕላስተር መቁረጫ ውዱ',
            'product_description' => 'Hand plaster cutter.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 28,
            'status' => 'active',
            'picsum_id' => 343,
            'file_prefix' => 'plaster-cutter',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0015],
                ['item_packaging_type_id' => 4, 'quantity' => 10, 'cbm' => 0.0150],
            ],
        ],
        // 146
        [
            'product_name' => 'Popit',
            'product_description' => 'Popit fidget toy.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 344,
            'file_prefix' => 'popit',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [5, 6, 7],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0005],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.1000],
            ],
        ],
        // 147
        [
            'product_name' => 'Price Tag ዋጋ መለጠፊያ',
            'product_description' => 'Price tags.',
            'packaging_details' => 'Packet of 100.',
            'item_category_id' => 39,    // Envelope / tags
            'status' => 'active',
            'picsum_id' => 345,
            'file_prefix' => 'price-tag',
            'color_ids' => [6, 1, 2, 3],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 100, 'cbm' => 0.0020],
                ['item_packaging_type_id' => 3, 'quantity' => 1000, 'cbm' => 0.0200],
            ],
        ],
        // 148
        [
            'product_name' => 'Puncher - (ትንሹ/ትንቁ) 520',
            'product_description' => 'Puncher small model 520.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 27,    // Puncher
            'status' => 'active',
            'picsum_id' => 346,
            'file_prefix' => 'puncher-520',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0120],
            ],
        ],
        // 149
        [
            'product_name' => 'Puncher - Small ፓንቸር ትንሹ',
            'product_description' => 'Small puncher.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 27,
            'status' => 'active',
            'picsum_id' => 347,
            'file_prefix' => 'puncher-small',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0008],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0100],
            ],
        ],
        // 150
        [
            'product_name' => 'Remover',
            'product_description' => 'Staple remover.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 26,    // Stapler accessories
            'status' => 'active',
            'picsum_id' => 348,
            'file_prefix' => 'remover',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0003],
                ['item_packaging_type_id' => 4, 'quantity' => 20, 'cbm' => 0.0060],
            ],
        ],
        // 151  (Existing 'Ring' moved here)
        [
            'product_name' => 'Ring - ረንግ (6/8/10/12/14/16/18/20)',
            'product_description' => 'High-durability binding rings supporting full mechanical sizing spans.',
            'packaging_details' => 'Packed in production bundles of 100 or industrial master cartons of 1600.',
            'item_category_id' => 28,
            'status' => 'active',
            'picsum_id' => 202,
            'file_prefix' => 'ring',
            'color_ids' => [1, 2, 3, 5, 6],
            'size_ids' => [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 100, 'cbm' => 0.0085],
                ['item_packaging_type_id' => 3, 'quantity' => 1600, 'cbm' => 0.1450],
            ],
        ],
        // 152
        [
            'product_name' => 'Rotring Eraser ሮተሪንግ ላጲስ',
            'product_description' => 'Rotring eraser.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 14,
            'status' => 'active',
            'picsum_id' => 349,
            'file_prefix' => 'rotring-eraser',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0002],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0025],
            ],
        ],
        // 153
        [
            'product_name' => 'Ruler - 30 cm normal',
            'product_description' => 'Standard 30cm ruler.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 35,
            'status' => 'active',
            'picsum_id' => 350,
            'file_prefix' => 'ruler-30cm-normal',
            'color_ids' => [6, 1, 2, 3],
            'size_ids' => [20],          // 8mm placeholder
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0004],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0050],
            ],
        ],
        // 154
        [
            'product_name' => 'Ruler - 30 cm ማስመሪያ 30 cm ጠንካራዉ',
            'product_description' => 'Strong 30cm ruler.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 35,
            'status' => 'active',
            'picsum_id' => 351,
            'file_prefix' => 'ruler-30cm-strong',
            'color_ids' => [5, 6],
            'size_ids' => [20],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0005],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0060],
            ],
        ],
        // 155
        [
            'product_name' => 'Ruler - 50 cm ማስመሪያ 50 cm',
            'product_description' => '50cm ruler.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 35,
            'status' => 'active',
            'picsum_id' => 352,
            'file_prefix' => 'ruler-50cm',
            'color_ids' => [5, 6, 1, 2],
            'size_ids' => [21],          // 10mm placeholder
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0008],
                ['item_packaging_type_id' => 4, 'quantity' => 10, 'cbm' => 0.0080],
            ],
        ],
        // 156
        [
            'product_name' => 'Ruler - Triangular Ruler 30 cm 144/288',
            'product_description' => 'Triangular ruler 30cm.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 36,    // Set Square
            'status' => 'active',
            'picsum_id' => 353,
            'file_prefix' => 'ruler-triangular',
            'color_ids' => [6, 1, 2, 3],
            'size_ids' => [20],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0070],
            ],
        ],
        // 157
        [
            'product_name' => 'Ruler - እርኬል ማስመሪያ',
            'product_description' => 'Circle ruler.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 35,
            'status' => 'active',
            'picsum_id' => 354,
            'file_prefix' => 'ruler-circle',
            'color_ids' => [6, 1, 2, 3],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0004],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0050],
            ],
        ],
        // 158
        [
            'product_name' => 'Scissor - Big መቀስ ትልቁ ባለክዳን',
            'product_description' => 'Large scissors with cover.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 44,    // Scissors
            'status' => 'active',
            'picsum_id' => 355,
            'file_prefix' => 'scissor-big',
            'color_ids' => [5, 6, 1, 2],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0120],
            ],
        ],
        // 159
        [
            'product_name' => 'Scissor - Kids የህፃናት መቀስ',
            'product_description' => 'Kids scissors.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 44,
            'status' => 'active',
            'picsum_id' => 356,
            'file_prefix' => 'scissor-kids',
            'color_ids' => [1, 2, 3, 4, 5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 4, 'quantity' => 24, 'cbm' => 0.0140],
            ],
        ],
        // 160
        [
            'product_name' => 'Scissor - Small ትንሹ መቀስ',
            'product_description' => 'Small scissors.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 44,
            'status' => 'active',
            'picsum_id' => 357,
            'file_prefix' => 'scissor-small',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0005],
                ['item_packaging_type_id' => 4, 'quantity' => 24, 'cbm' => 0.0120],
            ],
        ],
        // 161
        [
            'product_name' => 'Scissor - መካከለኝ መቀስ',
            'product_description' => 'Medium scissors.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 44,
            'status' => 'active',
            'picsum_id' => 358,
            'file_prefix' => 'scissor-medium',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0007],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0080],
            ],
        ],
        // 162
        [
            'product_name' => 'Set Square - 35 cm ሴትእስኩዊር 35 cm',
            'product_description' => '35cm set square.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 36,
            'status' => 'active',
            'picsum_id' => 359,
            'file_prefix' => 'setsquare-35cm',
            'color_ids' => [6, 1, 2, 3],
            'size_ids' => [22],          // 12mm placeholder
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0008],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0100],
            ],
        ],
        // 163
        [
            'product_name' => 'Set Square - Yellow ሲትስኬር ቢጫ',
            'product_description' => 'Yellow set square.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 36,
            'status' => 'active',
            'picsum_id' => 360,
            'file_prefix' => 'setsquare-yellow',
            'color_ids' => [4],
            'size_ids' => [22],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0006],
                ['item_packaging_type_id' => 4, 'quantity' => 24, 'cbm' => 0.0140],
            ],
        ],
        // 164
        [
            'product_name' => 'Set Square - ቢጫ ሴትስኬር ማርከር ያለዉ እና የሌለዉ',
            'product_description' => 'Yellow set square with or without marker.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 36,
            'status' => 'active',
            'picsum_id' => 361,
            'file_prefix' => 'setsquare-yellow-marker',
            'color_ids' => [4],
            'size_ids' => [22],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0007],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0080],
            ],
        ],
        // 165
        [
            'product_name' => 'Sharpner - with a Brush ባለ ቡሩሽ መቅረጫ',
            'product_description' => 'Sharpener with brush.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 15,
            'status' => 'active',
            'picsum_id' => 362,
            'file_prefix' => 'sharpener-brush',
            'color_ids' => [1, 2, 3, 4, 5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0003],
                ['item_packaging_type_id' => 4, 'quantity' => 24, 'cbm' => 0.0070],
            ],
        ],
        // 166
        [
            'product_name' => 'Sharpner - መቅረጫ',
            'product_description' => 'Standard sharpener.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 15,
            'status' => 'active',
            'picsum_id' => 363,
            'file_prefix' => 'sharpener',
            'color_ids' => [1, 2, 3, 4, 5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0002],
                ['item_packaging_type_id' => 4, 'quantity' => 48, 'cbm' => 0.0100],
            ],
        ],
        // 167
        [
            'product_name' => 'Stapler - Gold',
            'product_description' => 'Gold stapler.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 26,
            'status' => 'active',
            'picsum_id' => 364,
            'file_prefix' => 'stapler-gold',
            'color_ids' => [8, 5],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0120],
            ],
        ],
        // 168
        [
            'product_name' => 'Stapler - Kangaroo (335/435)',
            'product_description' => 'Kangaroo stapler models 335/435.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 26,
            'status' => 'active',
            'picsum_id' => 365,
            'file_prefix' => 'stapler-kangaroo',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0140],
            ],
        ],
        // 169
        [
            'product_name' => 'Stapler - ርካሹ',
            'product_description' => 'Budget stapler.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 26,
            'status' => 'active',
            'picsum_id' => 366,
            'file_prefix' => 'stapler-cheap',
            'color_ids' => [5, 6, 1, 2],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0008],
                ['item_packaging_type_id' => 4, 'quantity' => 24, 'cbm' => 0.0190],
            ],
        ],
        // 170
        [
            'product_name' => 'Subject - (3/4/5)',
            'product_description' => 'Subject notebooks (3/4/5 subjects).',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 1,
            'status' => 'active',
            'picsum_id' => 367,
            'file_prefix' => 'subject-3-4-5',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 171
        [
            'product_name' => 'Subject - A5 New',
            'product_description' => 'New A5 subject notebook.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 1,
            'status' => 'active',
            'picsum_id' => 368,
            'file_prefix' => 'subject-a5-new',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 172
        [
            'product_name' => 'Subject - A5-11 ማስታወሻ ሄሎ Subject',
            'product_description' => 'Hello subject notebook A5.',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 1,
            'status' => 'active',
            'picsum_id' => 369,
            'file_prefix' => 'subject-a5-11-hello',
            'color_ids' => [1, 2, 3, 4, 5],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 100, 'cbm' => 0.1000],
            ],
        ],
        // 173
        [
            'product_name' => 'T square 60cm',
            'product_description' => '60cm T-square.',
            'packaging_details' => 'Piece or box.',
            'item_category_id' => 37,    // T square
            'status' => 'active',
            'picsum_id' => 370,
            'file_prefix' => 'tsquare-60cm',
            'color_ids' => [5, 6],
            'size_ids' => [23],          // 14mm placeholder
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0020],
                ['item_packaging_type_id' => 4, 'quantity' => 10, 'cbm' => 0.0200],
            ],
        ],
        // 174
        [
            'product_name' => 'Ticket ትኬት',
            'product_description' => 'Ticket rolls/pads.',
            'packaging_details' => 'Packet of 50.',
            'item_category_id' => 39,
            'status' => 'active',
            'picsum_id' => 371,
            'file_prefix' => 'ticket',
            'color_ids' => [6, 1, 2, 3],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 50, 'cbm' => 0.0050],
                ['item_packaging_type_id' => 3, 'quantity' => 500, 'cbm' => 0.0500],
            ],
        ],
        // 175
        [
            'product_name' => 'Transparency  - Color ትራንስፓረንሲ ከለር',
            'product_description' => 'Color transparency sheets.',
            'packaging_details' => 'Packet of 10.',
            'item_category_id' => 20,
            'status' => 'active',
            'picsum_id' => 372,
            'file_prefix' => 'transparency-color',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 10, 'cbm' => 0.0020],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.0400],
            ],
        ],
        // 176
        [
            'product_name' => 'Transparency - White ትራንስፓረንሲ ነጭ',
            'product_description' => 'White transparency sheets.',
            'packaging_details' => 'Packet of 10.',
            'item_category_id' => 20,
            'status' => 'active',
            'picsum_id' => 373,
            'file_prefix' => 'transparency-white',
            'color_ids' => [6],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 10, 'cbm' => 0.0020],
                ['item_packaging_type_id' => 3, 'quantity' => 200, 'cbm' => 0.0400],
            ],
        ],
        // 177
        [
            'product_name' => 'Water Color',
            'product_description' => 'Watercolor set.',
            'packaging_details' => 'Box or carton.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 374,
            'file_prefix' => 'watercolor',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0200],
                ['item_packaging_type_id' => 3, 'quantity' => 240, 'cbm' => 0.4000],
            ],
        ],
        // 178
        [
            'product_name' => 'Water Color - ዉሃ ከለር ዉዱ ፍጭጭ የሚለዉ',
            'product_description' => 'Premium watercolor set.',
            'packaging_details' => 'Box or carton.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 375,
            'file_prefix' => 'watercolor-premium',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 4, 'quantity' => 1, 'cbm' => 0.0300],
                ['item_packaging_type_id' => 3, 'quantity' => 48, 'cbm' => 1.4400],
            ],
        ],
        // 179
        [
            'product_name' => 'ሰፈነግ (የብር መቁጠሪያ)',
            'product_description' => 'Money counter (silver).',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 41,    // Calculator / counter
            'status' => 'active',
            'picsum_id' => 376,
            'file_prefix' => 'sefeneg',
            'color_ids' => [5, 6],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0015],
                ['item_packaging_type_id' => 3, 'quantity' => 50, 'cbm' => 0.0750],
            ],
        ],
        // 180
        [
            'product_name' => 'ሽት ትፖቴክተር',
            'product_description' => 'Sheet protector.',
            'packaging_details' => 'Packet of 10.',
            'item_category_id' => 20,
            'status' => 'active',
            'picsum_id' => 377,
            'file_prefix' => 'sheet-protector',
            'color_ids' => [6],
            'size_ids' => [12],
            'packaging' => [
                ['item_packaging_type_id' => 2, 'quantity' => 10, 'cbm' => 0.0010],
                ['item_packaging_type_id' => 3, 'quantity' => 500, 'cbm' => 0.0500],
            ],
        ],
        // 181
        [
            'product_name' => 'የስጦታ ማስታወሻ የተሰራ',
            'product_description' => 'Gift notebook (handmade).',
            'packaging_details' => 'Piece or carton.',
            'item_category_id' => 9,
            'status' => 'active',
            'picsum_id' => 378,
            'file_prefix' => 'gift-notebook',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            'size_ids' => [13],
            'packaging' => [
                ['item_packaging_type_id' => 1, 'quantity' => 1, 'cbm' => 0.0012],
                ['item_packaging_type_id' => 3, 'quantity' => 50, 'cbm' => 0.0600],
            ],
        ],
        // 182
        [
            'product_name' => 'የውብዳር ከለር',
            'product_description' => 'Ubdar color set.',
            'packaging_details' => 'Box or carton.',
            'item_category_id' => 45,
            'status' => 'active',
            'picsum_id' => 379,
            'file_prefix' => 'ubdar-color',
            'color_ids' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'size_ids' => [],
            'packaging' => [
                ['item_packaging_type_id' => 4, 'quantity' => 12, 'cbm' => 0.0180],
                ['item_packaging_type_id' => 3, 'quantity' => 240, 'cbm' => 0.3600],
            ],
        ],
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
        $disk = Storage::disk('s3');
        $prefix = $data['file_prefix'];
        $itemImagesArray = [];

        for ($i = 1; $i <= 5; $i++) {
            $name = "{$prefix}_{$i}.jpg";
            if ($this->uploadToMinio($disk, $item->id, $name)) {
                $itemImagesArray[] = "uploads/items/{$item->id}/{$name}";
            }
        }

        for ($v = 1; $v <= 9; $v++) {
            for ($i = 1; $i <= 5; $i++) {
                $name = "{$prefix}_v{$v}_{$i}.jpg";
                $this->uploadToMinio($disk, $item->id, $name);
            }
        }

        return $itemImagesArray;
    }

    private function uploadToMinio($disk, $itemId, $fileName)
    {
        $sourcePath = storage_path("app/seed-images/{$fileName}");
        $minioPath = "uploads/items/{$itemId}/{$fileName}";

        if (!File::exists($sourcePath)) {
            return false;
        }

        try {
            if (!$disk->exists($minioPath)) {
                $disk->put($minioPath, File::get($sourcePath), 'public');
                echo "✅ Uploaded: {$minioPath}\n";
                return true;
            }
        } catch (\Exception $e) {
            echo "⚠️ Could not upload {$fileName}: " . $e->getMessage() . "\n";
            return false;
        }

        return true;
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
                ];
            }

            if (method_exists($variant, 'packagingQuantities')) {
                // FIX: Use sync() to ensure you aren't adding redundant records
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