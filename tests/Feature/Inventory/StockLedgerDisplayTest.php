<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\Inventory\InventoryMovement;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\ItemStockReader;
use App\Services\Inventory\PackagingLadder;
use App\Services\StockKeeperService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * How much we have, where it is, and how it is said.
 *
 * Three rules are pinned here, because four roles had four answers:
 *
 *   1. `item_stocks` is the ledger of record; `inventory_movements` is an audit
 *      journal and never the balance.
 *   2. A quantity is in the variant's own packaging unit, so totals are only
 *      comparable once converted to pieces.
 *   3. A shop floor is spoken in the smallest unit; everywhere else biggest
 *      unit first.
 */
class StockLedgerDisplayTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Item $item;

    private ItemVariant $carton;

    private ItemVariant $piece;

    private ItemPackagingType $cartonType;

    private ItemPackagingType $pieceType;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);

        $this->cartonType = ItemPackagingType::create(['name' => 'Carton']);
        $this->pieceType = ItemPackagingType::create(['name' => 'Piece']);

        $this->item = Item::factory()->create(['status' => 'active']);

        // The item's ladder: one carton holds 120 pieces.
        DB::table('item_packaging_type_item')->insert([
            ['item_id' => $this->item->id, 'item_packaging_type_id' => $this->cartonType->id, 'quantity' => 120],
            ['item_id' => $this->item->id, 'item_packaging_type_id' => $this->pieceType->id, 'quantity' => 1],
        ]);

        $this->carton = ItemVariant::factory()->create([
            'item_id' => $this->item->id,
            'item_packaging_type_id' => $this->cartonType->id,
        ]);

        $this->piece = ItemVariant::factory()->create([
            'item_id' => $this->item->id,
            'item_packaging_type_id' => $this->pieceType->id,
        ]);
    }

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

    private function ladder(): PackagingLadder
    {
        // Resolved fresh: the service memoizes per request, and these tests
        // change the data underneath it.
        return app()->make(PackagingLadder::class);
    }

    private function reader(): ItemStockReader
    {
        return app()->make(ItemStockReader::class);
    }

    private function stock(ItemVariant $variant, string $type, int $id, int $quantity, int $minimum = 0): void
    {
        ItemStock::updateOrCreate(
            ['item_variant_id' => $variant->id, 'location_type' => $type, 'location_id' => $id],
            ['quantity' => $quantity, 'min_stock_level' => $minimum],
        );
    }

    private function shelfId(): int
    {
        return (int) $this->store->inventoryLocations()->shelves()->firstOrFail()->id;
    }

    /* ---------------------------------------------------------------------
     | The ladder
     |--------------------------------------------------------------------*/

    #[Test]
    public function an_items_ladder_runs_from_its_biggest_unit_to_its_smallest(): void
    {
        $tiers = $this->ladder()->forItem((int) $this->item->id);

        $this->assertSame(['Carton', 'Piece'], array_column($tiers, 'name'));
        $this->assertSame([120, 1], array_column($tiers, 'pieces'));
        $this->assertSame('Piece', $this->ladder()->smallestTier((int) $this->item->id)['name']);
        $this->assertSame('Carton', $this->ladder()->largestTier((int) $this->item->id)['name']);
    }

    #[Test]
    public function a_quantity_is_counted_in_its_own_variants_unit(): void
    {
        // 11 cartons and 6 pieces is 1,326 pieces, not 17 of anything.
        $this->stock($this->carton, Store::class, (int) $this->store->id, 11);
        $this->stock($this->piece, Store::class, (int) $this->store->id, 6);

        $pieces = $this->reader()->piecesByItem([(int) $this->item->id], Store::class, (int) $this->store->id);

        $this->assertSame(1326, $pieces[(int) $this->item->id]);
    }

    #[Test]
    public function a_total_is_spoken_biggest_unit_first(): void
    {
        $ladder = $this->ladder();
        $units = $ladder->breakdown(3617, (int) $this->item->id);

        $this->assertSame([
            ['unit' => 'Carton', 'count' => 30, 'pieces' => 120],
            ['unit' => 'Piece', 'count' => 17, 'pieces' => 1],
        ], $units);

        $this->assertSame('30 Cartons · 17 Pieces', $ladder->label($units));
    }

    #[Test]
    public function an_exact_multiple_does_not_trail_a_zero_tier(): void
    {
        $ladder = $this->ladder();

        $this->assertSame('30 Cartons', $ladder->label($ladder->breakdown(3600, (int) $this->item->id)));
    }

    #[Test]
    public function a_total_of_nothing_still_names_a_unit(): void
    {
        $ladder = $this->ladder();

        $this->assertSame('0 Pieces', $ladder->label($ladder->breakdown(0, (int) $this->item->id)));
    }

    #[Test]
    public function the_smallest_mode_speaks_only_in_single_units(): void
    {
        $ladder = $this->ladder();

        $this->assertSame('3,617 Pieces', $ladder->label($ladder->smallest(3617, (int) $this->item->id)));
    }

    #[Test]
    public function an_item_with_no_declared_ladder_still_speaks_in_its_variants_packaging(): void
    {
        $other = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create([
            'item_id' => $other->id,
            'item_packaging_type_id' => $this->cartonType->id,
        ]);

        DB::table('item_variant_packaging_quantity')->insert([
            'item_variant_id' => $variant->id,
            'item_packaging_type_id' => $this->cartonType->id,
            'quantity' => 50,
        ]);

        $tiers = $this->ladder()->forItem((int) $other->id);

        $this->assertSame('Carton', $tiers[0]['name']);
        $this->assertSame(50, $tiers[0]['pieces']);
    }

    /* ---------------------------------------------------------------------
     | Where it is said, and how
     |--------------------------------------------------------------------*/

    #[Test]
    public function a_shop_floor_is_spoken_in_single_units_and_everywhere_else_in_bulk(): void
    {
        $reader = $this->reader();
        $warehouse = Warehouse::create(['name' => 'Remote Unit', 'store_id' => $this->store->id, 'status' => 'active']);

        $this->assertSame(
            PackagingLadder::DISPLAY_SMALLEST,
            $reader->displayModeForLocation(ItemInventoryLocation::class, $this->shelfId()),
        );

        $backroom = $this->store->inventoryLocations()->backrooms()->firstOrFail();

        foreach ([
            [ItemInventoryLocation::class, (int) $backroom->id],
            [Store::class, (int) $this->store->id],
            [Warehouse::class, (int) $warehouse->id],
        ] as [$type, $id]) {
            $this->assertSame(
                PackagingLadder::DISPLAY_BREAKDOWN,
                $reader->displayModeForLocation($type, $id),
                "{$type} #{$id} should be spoken biggest unit first.",
            );
        }
    }

    #[Test]
    public function the_same_stock_reads_differently_on_the_shelf_and_in_the_store(): void
    {
        $this->stock($this->carton, Store::class, (int) $this->store->id, 30);
        $this->stock($this->piece, Store::class, (int) $this->store->id, 17);
        $this->stock($this->piece, ItemInventoryLocation::class, $this->shelfId(), 47);

        $reader = $this->reader();

        $storeRow = $reader->paginateItems(Store::class, (int) $this->store->id)['rows'][0];
        $shelfRow = $reader->paginateItems(ItemInventoryLocation::class, $this->shelfId())['rows'][0];

        // The store is its shelf + floor: 30 cartons and 17 pieces on the
        // floor, plus the 47 pieces out on the shelf.
        $this->assertSame('30 Cartons · 64 Pieces', $storeRow['display']);
        $this->assertSame(PackagingLadder::DISPLAY_BREAKDOWN, $storeRow['display_mode']);

        $this->assertSame('47 Pieces', $shelfRow['display']);
        $this->assertSame(PackagingLadder::DISPLAY_SMALLEST, $shelfRow['display_mode']);
    }

    /* ---------------------------------------------------------------------
     | Items, not variants
     |--------------------------------------------------------------------*/

    #[Test]
    public function the_ledger_is_counted_in_items_with_variants_underneath(): void
    {
        $this->stock($this->carton, Store::class, (int) $this->store->id, 30);
        $this->stock($this->piece, Store::class, (int) $this->store->id, 17);

        $metrics = $this->reader()->metrics();

        $this->assertSame(1, $metrics['items'], 'Two ledger rows of one product are one item.');
        $this->assertSame(2, $metrics['variants']);
        $this->assertSame(2, $metrics['ledger_rows']);
        $this->assertSame(47, $metrics['units_on_hand'], 'The raw ledger sum, in mixed units.');
        $this->assertSame(3617, $metrics['pieces_on_hand'], 'The comparable total.');

        $page = $this->reader()->paginateItems(Store::class, (int) $this->store->id);

        $this->assertSame(1, $page['total_items']);
        $this->assertCount(1, $page['rows']);
        $this->assertSame(2, $page['rows'][0]['variant_count']);
    }

    #[Test]
    public function the_stock_desk_headlines_items_not_variants(): void
    {
        $this->stock($this->carton, Store::class, (int) $this->store->id, 30);
        $this->stock($this->piece, Store::class, (int) $this->store->id, 17);

        $metrics = app()->make(StockKeeperService::class)->metrics();

        $this->assertSame(1, $metrics['items']);
        $this->assertSame(2, $metrics['variants']);
        $this->assertSame(3617, $metrics['pieces_on_hand']);
    }

    #[Test]
    public function the_variant_rows_behind_an_item_name_the_unit_they_are_counted_in(): void
    {
        $this->stock($this->carton, Store::class, (int) $this->store->id, 11);

        $rows = $this->reader()->variantsForItem((int) $this->item->id, Store::class, (int) $this->store->id);

        $this->assertCount(1, $rows);
        $this->assertSame('Carton', $rows[0]['unit']);
        $this->assertSame(11, $rows[0]['quantity']);
        $this->assertSame(120, $rows[0]['pieces_per_unit']);
        $this->assertSame(1320, $rows[0]['pieces']);
    }

    /* ---------------------------------------------------------------------
     | Which ledger wins
     |--------------------------------------------------------------------*/

    #[Test]
    public function the_positional_ledger_outranks_the_movements_journal(): void
    {
        $storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $this->carton->id,
        ]);

        // A stale journal entry says 3; the ledger of record says 11.
        InventoryMovement::create([
            'store_variant_id' => $storeVariant->id,
            'type' => 'purchase',
            'quantity' => 3,
            'source_type' => 'supplier',
            'destination_type' => Store::class,
            'destination_id' => $this->store->id,
        ]);

        $this->stock($this->carton, Store::class, (int) $this->store->id, 11);

        $this->assertSame(11, app()->make(StockService::class)->getCurrentStock($storeVariant));
        $this->assertSame(11, $storeVariant->fresh()->current_stock);
    }

    #[Test]
    public function a_variant_with_no_positional_row_still_falls_back_to_its_journal(): void
    {
        $storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $this->piece->id,
        ]);

        InventoryMovement::create([
            'store_variant_id' => $storeVariant->id,
            'type' => 'purchase',
            'quantity' => 7,
            'source_type' => 'supplier',
            'destination_type' => Store::class,
            'destination_id' => $this->store->id,
        ]);

        $this->assertSame(7, app()->make(StockService::class)->getCurrentStock($storeVariant));
    }

    #[Test]
    public function in_stock_is_decided_by_the_positional_ledger(): void
    {
        $withStock = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $this->carton->id,
        ]);

        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $this->piece->id,
        ]);

        $this->stock($this->carton, Store::class, (int) $this->store->id, 4);

        $this->assertSame(
            [$withStock->id],
            StoreVariant::query()->inStock()->pluck('id')->map(fn ($id): int => (int) $id)->all(),
        );
    }
}
