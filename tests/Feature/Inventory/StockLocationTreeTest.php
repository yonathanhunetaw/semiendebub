<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Store\Store;
use App\Services\Inventory\StockLocationTree;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * STOCK_PLAN.md phase 1: the one location tree exists, is built from the
 * legacy tables, and stays in step with them while they are still in use.
 */
class StockLocationTreeTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function a_new_store_gets_a_group_node_with_a_shelf_and_a_back_room_and_no_remote_hub(): void
    {
        $store = Store::factory()->create(['name' => 'Bole Store', 'type' => Store::TYPE_RETAIL]);

        $node = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->sole();

        $this->assertFalse($node->is_stockable);
        $this->assertNull($node->parent_id);
        $this->assertSame('Bole Store', $node->name);

        $children = $node->children()->orderBy('kind')->get();

        $this->assertSame([StockLocation::KIND_BACKROOM, StockLocation::KIND_SHELF], $children->pluck('kind')->all());
        $this->assertTrue($children->every(fn (StockLocation $leaf): bool => $leaf->is_stockable && $leaf->store_id === $store->id));
        $this->assertSame(0, StockLocation::query()->where('kind', StockLocation::KIND_REMOTE_HUB)->count());
    }

    #[Test]
    public function renaming_a_store_renames_its_node(): void
    {
        $store = Store::factory()->create(['name' => 'Old Name', 'type' => Store::TYPE_RETAIL]);

        $store->update(['name' => 'New Name']);

        $this->assertSame('New Name', StockLocation::query()->legacy(Store::class, $store->id)->value('name'));
        $this->assertSame(1, StockLocation::query()->where('kind', StockLocation::KIND_STORE)->count());
    }

    #[Test]
    public function a_warehouse_is_a_shared_stockable_main_hub_that_follows_renames_and_deletes(): void
    {
        $warehouse = Warehouse::create(['name' => 'Main Distribution Hub A', 'code' => 'WH-MAIN-01']);

        $hub = StockLocation::query()->legacy(Warehouse::class, $warehouse->id)->sole();

        $this->assertSame(StockLocation::KIND_MAIN_HUB, $hub->kind);
        $this->assertSame('WH-MAIN-01', $hub->code);
        $this->assertTrue($hub->is_stockable);
        $this->assertNull($hub->store_id);

        $warehouse->update(['name' => 'Renamed Hub']);
        $this->assertSame('Renamed Hub', $hub->fresh()->name);

        $warehouse->delete();
        $this->assertNull($hub->fresh());
    }

    #[Test]
    public function a_store_has_at_most_one_remote_hub(): void
    {
        $store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $tree = app(StockLocationTree::class);

        $first = $tree->addRemoteHub($store);
        $second = $tree->addRemoteHub($store);

        $this->assertTrue($first->is($second));
        $this->assertSame('Main Store Remote Hub', $first->name);
        $this->assertSame(
            StockLocation::query()->legacy(Store::class, $store->id)->value('id'),
            $first->parent_id,
        );
    }

    #[Test]
    public function the_backfill_builds_the_planned_tree_from_legacy_rows(): void
    {
        $this->seedLegacyRowsWithoutEvents();

        $this->runBackfill();

        $this->assertSame(
            ['Main Distribution Hub A', 'Main Distribution Hub B'],
            DB::table('warehouses')->orderBy('id')->pluck('name')->all(),
        );
        $this->assertSame(0, DB::table('item_inventory_locations')->where('name', 'like', 'Wesen%')->count());

        $this->assertSame(2, StockLocation::query()->ofKind(StockLocation::KIND_MAIN_HUB)->whereNull('store_id')->count());
        $this->assertSame(2, StockLocation::query()->ofKind(StockLocation::KIND_STORE)->count());
        $this->assertSame(4, StockLocation::query()->ofKind(StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM)->count());

        $remote = StockLocation::query()->ofKind(StockLocation::KIND_REMOTE_HUB)->sole();
        $this->assertSame('Main Store Remote Hub', $remote->name);
        $this->assertSame(1, $remote->store_id);

        // Stock is never addressed at a group node.
        $this->assertSame(
            StockLocation::query()->ofKind(StockLocation::KIND_STORE)->count(),
            StockLocation::query()->where('is_stockable', false)->count(),
        );

        // Running it again changes nothing.
        $before = StockLocation::query()->count();
        $this->runBackfill();
        $this->assertSame($before, StockLocation::query()->count());
    }

    #[Test]
    public function the_backfill_refuses_to_delete_a_wesen_row_that_is_still_referenced(): void
    {
        $this->seedLegacyRowsWithoutEvents();

        $wesenId = (int) DB::table('item_inventory_locations')->where('name', 'Wesen Warehouse A')->value('id');
        DB::table('item_stocks')->insert([
            'item_variant_id' => \App\Models\Item\ItemVariant::factory()->create()->id,
            'location_type' => ItemInventoryLocation::class,
            'location_id' => $wesenId,
            'quantity' => 3,
        ]);

        try {
            $this->runBackfill();
            $this->fail('The backfill deleted a referenced Wesen row.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('still referenced', $e->getMessage());
        }

        $this->assertSame(0, StockLocation::query()->count());
        $this->assertSame('Main Distribution Hub', DB::table('warehouses')->where('id', 1)->value('name'));
    }

    /** The dev data's shape, written past the model events the backfill replaces. */
    private function seedLegacyRowsWithoutEvents(): void
    {
        $now = now();

        DB::table('stores')->insert([
            ['id' => 1, 'name' => 'Main Store', 'type' => 'retail', 'status' => 'active', 'created_at' => $now, 'updated_at' => $now],
            ['id' => 2, 'name' => 'Second Store', 'type' => 'retail', 'status' => 'active', 'created_at' => $now, 'updated_at' => $now],
        ]);

        DB::table('warehouses')->insert([
            ['id' => 1, 'name' => 'Main Distribution Hub', 'code' => 'WH-MAIN-01', 'store_id' => 1, 'status' => 'active', 'created_at' => $now, 'updated_at' => $now],
            ['id' => 2, 'name' => 'North Valley Annex', 'code' => 'WH-NORTH-02', 'store_id' => null, 'status' => 'active', 'created_at' => $now, 'updated_at' => $now],
        ]);

        foreach ([
            [1, 'Shop', 'shelf'], [1, 'Shop Warehouse', 'backroom'],
            [1, 'Wesen Warehouse A', 'other'], [1, 'Wesen Warehouse B', 'other'],
            [2, 'Shop Floor', 'shelf'], [2, 'Back Room', 'backroom'],
        ] as [$storeId, $name, $kind]) {
            DB::table('item_inventory_locations')->insert([
                'store_id' => $storeId, 'name' => $name, 'kind' => $kind, 'address' => '',
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        DB::table('stock_locations')->delete();
    }

    private function runBackfill(): void
    {
        $migration = require database_path('migrations/2026_10_03_100100_backfill_stock_locations.php');
        $migration->up();
    }
}
