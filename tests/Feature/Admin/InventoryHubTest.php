<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Stocktake;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
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
                ->has('deployedItems')
                ->has('itemsCarried')
                ->has('counts.refills')
                ->has('counts.counts'),
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

    /** A refill the planner proposed for `$store`, in `$state` and `$status`. */
    private function refill(Store $store, string $state = Transfer::APPROVAL_PENDING, string $status = 'pending'): Transfer
    {
        $variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]);

        return Transfer::query()->create([
            'reference' => 'TR-'.uniqid(),
            'item_variant_id' => $variant->id, 'from_store_id' => $store->id, 'to_store_id' => $store->id,
            'quantity' => 4, 'status' => $status, 'origin' => Transfer::ORIGIN_MANUAL, 'approval_state' => $state,
        ]);
    }

    /** A stocktake at `$store`'s own location node. */
    private function stocktake(Store $store, string $status): Stocktake
    {
        $node = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();

        return Stocktake::query()->create([
            'reference' => 'ST-'.uniqid(), 'stock_location_id' => $node->id, 'status' => $status,
            'started_by' => auth()->id(), 'submitted_by' => auth()->id(),
        ]);
    }

    #[Test]
    public function the_approvals_count_only_refills_awaiting_a_ruling_and_submitted_counts(): void
    {
        /*
         * "All stores" carries the same Approvals card as one store's page, so
         * its figures must mean the same: a refill still waiting for a ruling,
         * and a count submitted but not yet approved.
         */
        $store = Store::factory()->create(['type' => 'retail']);

        $this->refill($store);
        $this->refill($store, Transfer::APPROVAL_PENDING, 'cancelled');
        $this->refill($store, Transfer::APPROVAL_NOT_REQUIRED);
        $this->stocktake($store, Stocktake::SUBMITTED);
        $this->stocktake($store, Stocktake::COUNTING);

        $this->get(route('inventory.index'))->assertInertia(
            fn (Assert $page) => $page
                ->where('counts.refills', 1)
                ->where('counts.counts', 1),
        );
    }

    #[Test]
    public function items_carried_counts_each_deployed_item_once_across_the_stores(): void
    {
        $first = Store::factory()->create(['type' => 'retail']);
        $second = Store::factory()->create(['type' => 'retail']);

        // At both stores, and two variants at the first: still one item.
        $shared = Item::factory()->create();
        $this->position($shared, $first, 3);
        $this->position($shared, $first, 3);
        $this->position($shared, $second, 3);
        $this->position(Item::factory()->create(), $second, 3);

        $this->get(route('inventory.index'))->assertInertia(fn (Assert $page) => $page->where('itemsCarried', 2));
    }

    #[Test]
    public function a_store_admin_sees_only_their_own_stores_figures(): void
    {
        $own = Store::factory()->create(['name' => 'Own Store', 'type' => 'retail']);
        $other = Store::factory()->create(['name' => 'Other Store', 'type' => 'retail']);

        $this->position(Item::factory()->create(), $own, 5);
        $this->position(Item::factory()->create(), $other, 5);
        $this->position(Item::factory()->create(), $other, 5);
        $this->refill($own);
        $this->refill($other);
        $this->refill($other);
        $this->stocktake($own, Stocktake::SUBMITTED);
        $this->stocktake($other, Stocktake::SUBMITTED);
        $this->stocktake($other, Stocktake::SUBMITTED);

        $storeAdmin = User::factory()->create(['role' => 'admin', 'store_id' => $own->id]);
        $storeAdmin->assignRole('admin');

        $this->actingAs($storeAdmin->refresh(), 'web')->get(route('inventory.index'))->assertInertia(
            fn (Assert $page) => $page
                ->has('stores', 1)
                ->where('stores.0.name', 'Own Store')
                ->where('itemsCarried', 1)
                ->where('counts.refills', 1)
                ->where('counts.counts', 1),
        );
    }

    #[Test]
    public function orders_are_left_to_the_orders_screen(): void
    {
        // The page is laid out like one store's page now; the order pipeline lives under Orders.
        $this->get(route('inventory.index'))->assertInertia(fn (Assert $page) => $page->missing('orderStages'));
    }
}
