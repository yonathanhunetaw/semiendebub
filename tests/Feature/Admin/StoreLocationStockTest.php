<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\StoreLocationStockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The three places a store reports stock at.
 *
 *   Store Shelf      item_stocks at an item_inventory_locations row of kind
 *                    `shelf`. What has been put out front.
 *   Store Room       the store's own total minus the shelf. Derived, so the
 *                    pair always adds back up to the figure every other reader
 *                    means by "the store's stock".
 *   Remote Warehouse item_stocks at the Warehouse joined to the store by
 *                    Store::warehouse().
 *
 * Only the third was real before. The first two were
 * `Math.round(total * 0.25)` and the remainder, computed in the browser, and
 * they sat beside "Warehouse A" and "Warehouse B" pills reading from
 * `warehouse_a_stock` / `warehouse_b_stock` — props no controller has ever
 * sent, so both permanently showed 0.
 */
class StoreLocationStockTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withServerVariables(['HTTP_HOST' => 'admin.localhost']);

        $admin = User::factory()->create(['role' => 'admin']);
        \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'web');

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => 'retail']);
    }

    private function service(): StoreLocationStockService
    {
        return app(StoreLocationStockService::class);
    }

    /** The shelf the store was provisioned with on creation. */
    private function shelf(): ItemInventoryLocation
    {
        return ItemInventoryLocation::where('store_id', $this->store->id)
            ->shelves()
            ->firstOrFail();
    }

    private function positionAt(ItemVariant $variant, string $type, int $id, int $quantity): void
    {
        ItemStock::create([
            'item_variant_id' => $variant->id,
            'location_type' => $type,
            'location_id' => $id,
            'quantity' => $quantity,
        ]);
    }

    #[Test]
    public function every_new_store_gets_a_shelf_and_a_back_room(): void
    {
        /*
         * The migration that introduced `kind` created rows only for two
         * stores named in a constant, and a migration can only ever reach the
         * stores that already exist. A store created afterwards had no shelf
         * row, and a store with no shelf row reports its whole total as back
         * room for ever — which is what sent the old screen back to splitting
         * the total 25/75 in the browser.
         */
        $fresh = Store::factory()->create(['name' => 'Opened Today']);

        $this->assertDatabaseHas('item_inventory_locations', [
            'store_id' => $fresh->id,
            'kind' => ItemInventoryLocation::KIND_SHELF,
        ]);
        $this->assertDatabaseHas('item_inventory_locations', [
            'store_id' => $fresh->id,
            'kind' => ItemInventoryLocation::KIND_BACKROOM,
        ]);
    }

    #[Test]
    public function a_store_is_given_exactly_one_shelf(): void
    {
        // firstOrCreate on the kind, so re-saving a store cannot accumulate
        // shelves that would each be counted.
        $this->store->save();
        $this->store->refresh();

        $this->assertSame(
            1,
            ItemInventoryLocation::where('store_id', $this->store->id)
                ->shelves()
                ->count(),
        );
    }

    #[Test]
    public function the_store_created_by_the_factory_can_hold_shelf_stock_immediately(): void
    {
        // The point of provisioning on create: no setup step is needed before
        // stock can be positioned on the floor.
        $shelf = ItemInventoryLocation::where('store_id', $this->store->id)->shelves()->firstOrFail();

        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $this->positionAt($variant, ItemInventoryLocation::class, $shelf->id, 25);

        $locations = collect($this->service()->locations($this->store, [$variant->id => 1], 100));

        $this->assertSame(25, $locations->firstWhere('key', 'shelf')['stock']);
    }

    #[Test]
    public function a_store_with_no_shelf_row_reports_all_of_its_stock_in_the_store_room(): void
    {
        ItemInventoryLocation::where('store_id', $this->store->id)->delete();

        $locations = collect($this->service()->locations($this->store, [1 => 1], 400));

        // Not 25% of 400. Nothing records what is on the floor, so nothing
        // claims to.
        $this->assertSame(0, $locations->firstWhere('key', 'shelf')['stock']);
        $this->assertSame(400, $locations->firstWhere('key', 'store_room')['stock']);
    }

    #[Test]
    public function shelf_stock_comes_from_the_ledger_and_the_store_room_is_the_remainder(): void
    {
        $shelf = $this->shelf();
        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->positionAt($variant, ItemInventoryLocation::class, $shelf->id, 30);

        $locations = collect($this->service()->locations($this->store, [$variant->id => 1], 100));

        $this->assertSame(30, $locations->firstWhere('key', 'shelf')['stock']);
        $this->assertSame(70, $locations->firstWhere('key', 'store_room')['stock']);
    }

    #[Test]
    public function shelf_and_store_room_always_sum_to_the_store_total(): void
    {
        $shelf = $this->shelf();
        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->positionAt($variant, ItemInventoryLocation::class, $shelf->id, 17);

        $locations = collect($this->service()->locations($this->store, [$variant->id => 1], 90));

        $this->assertSame(
            90,
            $locations->firstWhere('key', 'shelf')['stock']
                + $locations->firstWhere('key', 'store_room')['stock'],
            'The derived store room is what keeps the two from drifting apart.',
        );
    }

    #[Test]
    public function a_shelf_holding_more_than_the_store_total_cannot_push_the_store_room_negative(): void
    {
        // The two ledgers can disagree after a bad adjustment. The screen
        // should stay readable rather than show "-50 pcs".
        $shelf = $this->shelf();
        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->positionAt($variant, ItemInventoryLocation::class, $shelf->id, 150);

        $locations = collect($this->service()->locations($this->store, [$variant->id => 1], 100));

        $this->assertSame(100, $locations->firstWhere('key', 'shelf')['stock']);
        $this->assertSame(0, $locations->firstWhere('key', 'store_room')['stock']);
    }

    #[Test]
    public function shelf_quantities_are_converted_from_packaging_units_to_pieces(): void
    {
        /*
         * item_stocks counts packaging units; every figure the tool shows is in
         * pieces. Mixing the two is what made a carton of twelve and a loose
         * piece count the same.
         */
        $shelf = $this->shelf();
        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->positionAt($variant, ItemInventoryLocation::class, $shelf->id, 4);

        $locations = collect($this->service()->locations($this->store, [$variant->id => 12], 100));

        $this->assertSame(48, $locations->firstWhere('key', 'shelf')['stock']);
    }

    #[Test]
    public function a_back_room_location_is_not_counted_as_shelf(): void
    {
        $backroom = ItemInventoryLocation::create([
            'name' => 'Back Room',
            'kind' => ItemInventoryLocation::KIND_BACKROOM,
            'store_id' => $this->store->id,
            'address' => '',
        ]);

        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $this->positionAt($variant, ItemInventoryLocation::class, $backroom->id, 60);

        $locations = collect($this->service()->locations($this->store, [$variant->id => 1], 100));

        $this->assertSame(0, $locations->firstWhere('key', 'shelf')['stock']);
    }

    #[Test]
    public function another_stores_shelf_is_not_counted(): void
    {
        $other = Store::factory()->create();
        $otherShelf = ItemInventoryLocation::create([
            'name' => 'Shop Floor',
            'kind' => ItemInventoryLocation::KIND_SHELF,
            'store_id' => $other->id,
            'address' => '',
        ]);

        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $this->positionAt($variant, ItemInventoryLocation::class, $otherShelf->id, 80);

        $locations = collect($this->service()->locations($this->store, [$variant->id => 1], 100));

        $this->assertSame(0, $locations->firstWhere('key', 'shelf')['stock']);
    }

    #[Test]
    public function remote_warehouse_stock_comes_from_the_stores_own_remote_hub(): void
    {
        // STOCK_PLAN.md phase 4: a store's remote tier is its Remote Hub in
        // the location tree. A shared main hub is never "this store's" — the
        // old warehouses.store_id link made Hub A read as Main Store's.
        $remote = app(\App\Services\Inventory\StockLocationTree::class)->addRemoteHub($this->store);
        $sharedHub = Warehouse::create(['name' => 'Main Distribution Hub A', 'store_id' => $this->store->id]);

        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        app(\App\Services\StockService::class)->receive($variant->id, $remote, 500);
        $this->positionAt($variant, Warehouse::class, $sharedHub->id, 900);

        $locations = collect($this->service()->locations($this->store, [$variant->id => 1], 100));

        $this->assertSame(500, $locations->firstWhere('key', 'remote_warehouse')['stock']);
    }

    #[Test]
    public function a_store_with_no_remote_warehouse_reports_zero_rather_than_failing(): void
    {
        $locations = collect($this->service()->locations($this->store, [1 => 1], 100));

        $this->assertSame(0, $locations->firstWhere('key', 'remote_warehouse')['stock']);
    }

    #[Test]
    public function the_store_page_sends_the_three_locations_for_each_item(): void
    {
        $packaging = ItemPackagingType::factory()->create();
        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create([
            'item_id' => $item->id,
            'item_packaging_type_id' => $packaging->id,
        ]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_id' => $item->id,
            'item_variant_id' => $variant->id,
            'active' => true,
        ]);

        $this->get(route('store.show', $this->store))->assertOk()->assertInertia(function (Assert $page) {
            $first = $page->toArray()['props']['inventory']['data'][0];

            $this->assertSame(
                ['shelf', 'store_room', 'remote_warehouse'],
                array_column($first['locations'], 'key'),
            );
            $this->assertSame(
                ['Store Shelf', 'Store Floor', 'Remote Hub'],
                array_column($first['locations'], 'label'),
            );
        });
    }

    #[Test]
    public function the_item_variants_page_sends_the_three_locations_too(): void
    {
        $packaging = ItemPackagingType::factory()->create();
        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create([
            'item_id' => $item->id,
            'item_packaging_type_id' => $packaging->id,
        ]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_id' => $item->id,
            'item_variant_id' => $variant->id,
            'active' => true,
        ]);

        $this->get(route('store.item.variants', ['store' => $this->store->id, 'item' => $item->id]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->has('item.locations', 3)
                ->where('item.locations.0.key', 'shelf')
                ->where('item.locations.2.key', 'remote_warehouse'));
    }
}
