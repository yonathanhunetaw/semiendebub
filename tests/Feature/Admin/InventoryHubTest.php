<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The admin inventory hub at /inventory.
 *
 * This page rendered blank. Admin/Inventory/Index.tsx mapped over a `shown`
 * variable that was never declared — no import, no assignment — so the
 * component threw a ReferenceError on first paint and React unmounted the tree.
 * The server was sending correct props the whole time, which is why nothing in
 * the Laravel log pointed at it.
 *
 * A render test cannot catch an undefined identifier in the React bundle, so
 * these cover the half that is testable: the props the page needs are all
 * present and mean what the page assumes. The missing identifier itself is
 * caught by `tsc --noEmit`, which fails on it as TS2304.
 */
class InventoryHubTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withServerVariables(['HTTP_HOST' => 'admin.localhost']);

        $admin = User::factory()->create(['role' => 'admin']);
        \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $admin->assignRole('admin');

        $this->actingAs($admin, 'web');
    }

    /** Positions `$quantity` of a new variant of `$item` at `$store`. */
    private function position(Item $item, Store $store, int $quantity): ItemVariant
    {
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        StoreVariant::factory()->create([
            'store_id' => $store->id,
            'item_id' => $item->id,
            'item_variant_id' => $variant->id,
            'active' => true,
        ]);

        ItemStock::create([
            'item_variant_id' => $variant->id,
            'location_id' => $store->id,
            'location_type' => Store::class,
            'quantity' => $quantity,
        ]);

        return $variant;
    }

    #[Test]
    public function the_hub_renders(): void
    {
        $this->get(route('inventory.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Admin/Inventory/Index'));
    }

    #[Test]
    public function it_sends_every_prop_the_page_destructures(): void
    {
        /*
         * The page destructures all six in its signature. A missing one is how
         * the screen this replaced failed: it declared an `item` prop the
         * controller never sent and tripped its own `if (!item) return null`.
         */
        $this->get(route('inventory.index'))->assertInertia(
            fn (Assert $page) => $page
                ->has('stores')
                ->has('warehouses')
                ->has('shipmentCounts')
                ->has('transferCounts')
                ->has('catalogue')
                ->has('deployedItems'),
        );
    }

    #[Test]
    public function it_renders_with_no_stores_warehouses_or_stock_at_all(): void
    {
        // The empty state is a real state — a fresh install — and the page has
        // to survive it rather than divide by a zero-length list.
        $this->get(route('inventory.index'))->assertOk()->assertInertia(
            fn (Assert $page) => $page
                ->has('stores', 0)
                ->has('deployedItems', 0)
                ->where('catalogue.items', 0),
        );
    }

    #[Test]
    public function a_store_counts_only_the_items_actually_holding_stock_there(): void
    {
        /*
         * `live_items` used to be `withCount('items')`, which counts the
         * item_store pivot. That pivot attaches the whole catalogue to every
         * store, so a store holding nothing still reported the full item count.
         */
        $store = Store::factory()->create(['name' => 'Stocked Store', 'type' => 'retail']);
        $empty = Store::factory()->create(['name' => 'Empty Store', 'type' => 'retail']);

        $item = Item::factory()->create();
        $this->position($item, $store, 30);

        // Attached to both stores by the pivot, but positioned at neither.
        $other = Item::factory()->create();
        $other->stores()->attach([$store->id, $empty->id]);

        $this->get(route('inventory.index'))->assertInertia(function (Assert $page) {
            $stores = collect($page->toArray()['props']['stores']);

            $this->assertSame(1, $stores->firstWhere('name', 'Stocked Store')['live_items']);
            $this->assertSame(30, $stores->firstWhere('name', 'Stocked Store')['units']);
            $this->assertSame(0, $stores->firstWhere('name', 'Empty Store')['live_items']);
        });
    }

    #[Test]
    public function deployed_items_report_stock_per_store_from_the_positional_ledger(): void
    {
        $first = Store::factory()->create(['name' => 'First Store', 'type' => 'retail']);
        $second = Store::factory()->create(['name' => 'Second Store', 'type' => 'retail']);

        $item = Item::factory()->create(['product_name' => 'Spread Item']);
        $this->position($item, $first, 10);
        $this->position($item, $second, 25);

        $this->get(route('inventory.index'))->assertInertia(function (Assert $page) {
            $items = collect($page->toArray()['props']['deployedItems']);
            $row = $items->firstWhere('name', 'Spread Item');

            $this->assertNotNull($row);
            $this->assertSame(35, $row['store_stock']);

            // Busiest first: an admin opening this is looking for where the
            // stock is, not for alphabetical order.
            $this->assertSame(['Second Store', 'First Store'], array_column($row['stores'], 'name'));
        });
    }

    #[Test]
    public function warehouse_stock_is_reported_separately_from_store_stock(): void
    {
        $store = Store::factory()->create(['type' => 'retail']);
        $warehouse = Warehouse::create(['name' => 'Central Hub', 'location' => 'Addis']);

        $item = Item::factory()->create(['product_name' => 'Split Item']);
        $variant = $this->position($item, $store, 5);

        ItemStock::create([
            'item_variant_id' => $variant->id,
            'location_id' => $warehouse->id,
            'location_type' => Warehouse::class,
            'quantity' => 200,
        ]);

        $this->get(route('inventory.index'))->assertInertia(function (Assert $page) {
            $row = collect($page->toArray()['props']['deployedItems'])->firstWhere('name', 'Split Item');

            // The two ledgers are different places; adding them would claim
            // the shop holds 205.
            $this->assertSame(5, $row['store_stock']);
            $this->assertSame(200, $row['warehouse_stock']);
            $this->assertSame('Central Hub', $row['warehouses'][0]['name']);
        });
    }

    #[Test]
    public function an_item_holding_no_stock_anywhere_is_not_offered_in_the_picker(): void
    {
        // The picker opens a per-location stock tool, so an item with no
        // location to open would be a dead row.
        Item::factory()->create(['product_name' => 'Catalogue Only']);

        $this->get(route('inventory.index'))->assertInertia(
            fn (Assert $page) => $page
                ->has('deployedItems', 0)
                ->where('catalogue.items', 1),
        );
    }
}
