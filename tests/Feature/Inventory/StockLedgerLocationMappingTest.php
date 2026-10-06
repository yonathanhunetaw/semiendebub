<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\Inventory\ItemStock;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\StockKeeper\ItemStock as KeeperItemStock;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * STOCK_PLAN.md phase 2: every ledger row is booked against a stockable leaf,
 * old writers keep that true without knowing about it, and the mapping never
 * changes a quantity (acceptance tests 5 and 6).
 */
class StockLedgerLocationMappingTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Warehouse $hub;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $this->hub = Warehouse::create(['name' => 'Main Distribution Hub A', 'code' => 'WH-MAIN-01']);
    }

    #[Test]
    public function a_store_level_row_written_the_old_way_books_onto_the_store_floor(): void
    {
        $stock = ItemStock::create([
            'item_variant_id' => ItemVariant::factory()->create()->id,
            'location_type' => Store::class,
            'location_id' => $this->store->id,
            'quantity' => 12,
        ]);

        $leaf = $stock->stockLocation;

        $this->assertSame(StockLocation::KIND_BACKROOM, $leaf->kind);
        $this->assertSame('Store Floor', $leaf->name);
        $this->assertSame($this->store->id, $leaf->store_id);
    }

    #[Test]
    public function hub_and_shelf_rows_book_onto_their_own_leaves_through_either_item_stock_model(): void
    {
        $variant = ItemVariant::factory()->create();
        $shelf = $this->store->inventoryLocations()->where('kind', ItemInventoryLocation::KIND_SHELF)->sole();

        $atHub = KeeperItemStock::firstOrCreate(
            ['item_variant_id' => $variant->id, 'location_type' => Warehouse::class, 'location_id' => $this->hub->id],
            ['quantity' => 0],
        );
        $onShelf = ItemStock::create([
            'item_variant_id' => $variant->id,
            'location_type' => ItemInventoryLocation::class,
            'location_id' => $shelf->id,
            'quantity' => 3,
        ]);

        $this->assertSame(StockLocation::KIND_MAIN_HUB, StockLocation::find($atHub->stock_location_id)->kind);
        $this->assertSame(StockLocation::KIND_SHELF, StockLocation::find($onShelf->stock_location_id)->kind);
    }

    #[Test]
    public function stock_rows_only_ever_point_at_stockable_locations(): void
    {
        $variant = ItemVariant::factory()->create();

        foreach ([[Store::class, $this->store->id], [Warehouse::class, $this->hub->id]] as [$type, $id]) {
            ItemStock::create(['item_variant_id' => $variant->id, 'location_type' => $type, 'location_id' => $id, 'quantity' => 5]);
        }

        $this->assertSame(0, ItemStock::query()->whereNull('stock_location_id')->count());
        $this->assertSame(0, ItemStock::query()
            ->whereHas('stockLocation', fn ($q) => $q->where('is_stockable', false))
            ->count());
    }

    #[Test]
    public function the_backfill_maps_legacy_rows_without_changing_any_variant_total(): void
    {
        [$a, $b] = ItemVariant::factory()->count(2)->create()->all();

        $legacy = [
            [$a->id, Store::class, $this->store->id, 40],
            [$a->id, Warehouse::class, $this->hub->id, 7],
            [$b->id, Store::class, $this->store->id, 11],
        ];

        foreach ($legacy as [$variantId, $type, $id, $qty]) {
            DB::table('item_stocks')->insert([
                'item_variant_id' => $variantId, 'location_type' => $type, 'location_id' => $id, 'quantity' => $qty,
            ]);
        }

        $before = $this->totals();
        $this->assertSame(3, DB::table('item_stocks')->whereNull('stock_location_id')->count());

        $this->runBackfill();

        $this->assertSame($before, $this->totals());
        $this->assertSame(0, DB::table('item_stocks')->whereNull('stock_location_id')->count());
        $this->assertSame(51, (int) DB::table('item_stocks as s')
            ->join('stock_locations as l', 'l.id', '=', 's.stock_location_id')
            ->where('l.kind', StockLocation::KIND_BACKROOM)->sum('s.quantity'));
        $this->assertSame(7, (int) DB::table('item_stocks as s')
            ->join('stock_locations as l', 'l.id', '=', 's.stock_location_id')
            ->where('l.kind', StockLocation::KIND_MAIN_HUB)->sum('s.quantity'));
    }

    #[Test]
    public function the_backfill_refuses_a_row_with_nowhere_to_go(): void
    {
        DB::table('item_stocks')->insert([
            'item_variant_id' => ItemVariant::factory()->create()->id,
            'location_type' => Warehouse::class,
            'location_id' => 999,
            'quantity' => 4,
        ]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('no stockable location');

        $this->runBackfill();
    }

    /** @return array<int, int> */
    private function totals(): array
    {
        return DB::table('item_stocks')
            ->selectRaw('item_variant_id, SUM(quantity) as total')
            ->groupBy('item_variant_id')
            ->orderBy('item_variant_id')
            ->pluck('total', 'item_variant_id')
            ->map(fn ($t): int => (int) $t)
            ->all();
    }

    private function runBackfill(): void
    {
        $migration = require database_path('migrations/2026_10_03_110000_book_item_stocks_against_stock_locations.php');
        $migration->up();
    }
}
