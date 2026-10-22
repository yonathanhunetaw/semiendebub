<?php

declare(strict_types=1);

namespace Tests\Feature\Guide;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\CheckoutService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The desks of the Guide's world (`play.stations`): what each module has
 * waiting for the viewer, and the route each action calls on the viewer's own app.
 */
class GuideWorldStationsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $shelf;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'stock_keeper', 'delivery', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
    }

    /** `$storeId`: the Main Store when left out, none (a global admin) when null. */
    private function user(string $role, int|false|null $storeId = false): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId === false ? $this->store->id : $storeId]);
        $user->assignRole($role);

        return $user;
    }

    /** The viewer's desks, from the Guide world route on their own app. */
    private function stations(User $viewer, string $app): array
    {
        $host = ['stock_keeper' => 'stockkeeper'][$app] ?? $app;
        $this->withServerVariables(['HTTP_HOST' => "{$host}.localhost"]);

        return $this->actingAs($viewer)->getJson(route("{$app}.guide.world", ['play' => 1]))->assertOk()->json('play.stations');
    }

    private function station(array $stations, string $key): ?array
    {
        return collect($stations)->firstWhere('key', $key);
    }

    private function paidOrder(int $quantity = 4): Sale
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id, 'active' => true]);
        app(StockService::class)->receive($variant->id, $this->shelf, 20);
        $cart = Cart::create(['store_id' => $this->store->id, 'status' => 'open']);
        $cart->variants()->attach($variant->id, ['quantity' => $quantity, 'price' => 100, 'store_id' => $this->store->id]);

        return app(CheckoutService::class)->checkout($cart, ['payment_method' => 'cash']);
    }

    #[Test]
    public function the_orders_desk_walks_an_order_from_start_to_hand_over_on_both_the_keeper_and_seller_apps(): void
    {
        $sale = $this->paidOrder();

        foreach (['stock_keeper' => 'stock_keeper.orders', 'seller' => 'seller.orders'] as $app => $prefix) {
            $viewer = $this->user($app);
            $orders = $this->station($this->stations($viewer, $app), 'orders');
            $this->assertSame('desk_orders', $orders['desk']);
            $this->assertCount(1, $orders['items']);
            $actions = $orders['items'][0]['actions'];
            $this->assertSame('start', $actions[0]['key']);
            $this->assertSame(route("{$prefix}.picking.start", $sale->id, false), $actions[0]['url']);
            $this->assertSame('tick-'.$sale->items->first()->id, $actions[1]['key']);
            $this->assertSame(['done' => true], $actions[1]['data']);
        }

        // Ticked and packed: it can be handed on with a decision for every line.
        $keeper = $this->user('stock_keeper');
        $sale->items->each->update(['ticked_at' => now()]);
        $sale->update(['picking_started_at' => now()]);
        $this->assertSame('packed', $this->station($this->stations($keeper, 'stock_keeper'), 'orders')['items'][0]['actions'][0]['key']);
        $sale->update(['packed_at' => now(), 'picking_started_at' => now()]);
        $confirm = collect($this->station($this->stations($keeper, 'stock_keeper'), 'orders')['items'][0]['actions'])->firstWhere('key', 'confirm');
        $this->assertSame(route('stock_keeper.orders.pick', $sale->id, false), $confirm['url']);
        // Each line is sourced from the place the Pick & Pack plan itself suggests.
        $this->assertSame($sale->items->first()->id, $confirm['data']['lines'][0]['sale_item_id']);
        $this->assertNotEmpty($confirm['data']['lines'][0]['location_type']);

        // The delivery app has no orders desk.
        $this->assertNull($this->station($this->stations($this->user('delivery'), 'delivery'), 'orders'));
    }

    #[Test]
    public function the_counts_desk_starts_counts_enters_lines_and_asks_a_second_person_to_approve(): void
    {
        $this->paidOrder();   // puts stock on the shelf, so a count of it has a line
        $keeper = $this->user('stock_keeper');
        $counts = $this->station($this->stations($keeper, 'stock_keeper'), 'counts');
        $this->assertSame('desk_counts', $counts['desk']);
        $this->assertSame('start', $counts['items'][0]['id']);
        $this->assertSame(route('stock_keeper.stocktakes.store', [], false), $counts['items'][0]['actions'][0]['url']);

        $take = app(\App\Services\Inventory\StocktakeService::class)->start($this->shelf, $keeper);
        $item = collect($this->station($this->stations($keeper, 'stock_keeper'), 'counts')['items'])->firstWhere('id', (string) $take->id);
        $count = collect($item['actions'])->firstWhere('key', 'count');
        $this->assertSame(route('stock_keeper.stocktakes.count', $take->id, false), $count['url']);
        $this->assertSame('counted', $count['fields'][0]['name']);
        $this->assertContains('void', array_column($item['actions'], 'key'));

        // Submitted: the submitter may not approve it; another keeper and the admin may.
        $line = $take->lines()->firstOrFail();
        app(\App\Services\Inventory\StocktakeService::class)->count($take, (int) $line->item_variant_id, 20, $keeper);
        app(\App\Services\Inventory\StocktakeService::class)->submit($take, $keeper);
        $mine = collect($this->station($this->stations($keeper, 'stock_keeper'), 'counts')['items'])->firstWhere('id', (string) $take->id);
        $this->assertNotContains('post', array_column($mine['actions'], 'key'));
        $other = collect($this->station($this->stations($this->user('stock_keeper'), 'stock_keeper'), 'counts')['items'])->firstWhere('id', (string) $take->id);
        $this->assertContains('post', array_column($other['actions'], 'key'));
        $admin = $this->station($this->stations($this->user('admin', null), 'admin'), 'counts');
        $this->assertSame(route('admin.inventory.counts.approve', $take->id, false), $admin['items'][0]['actions'][0]['url']);
    }

    #[Test]
    public function the_transfers_desk_offers_to_raise_a_transfer_from_a_place_that_has_stock(): void
    {
        $remoteHub = app(\App\Services\Inventory\StockLocationTree::class)->addRemoteHub($this->store);
        $this->assertNull($this->station($this->stations($this->user('stock_keeper'), 'stock_keeper'), 'moves')['items'][0] ?? null);

        $variant = ItemVariant::factory()->create();
        app(StockService::class)->receive($variant->id, $remoteHub, 12);
        $moves = $this->station($this->stations($this->user('stock_keeper'), 'stock_keeper'), 'moves');
        $this->assertSame('remote_hub-backroom', $moves['items'][0]['id']);
        $raise = $moves['items'][0]['actions'][0];
        $this->assertSame(route('stock_keeper.transfers.store', [], false), $raise['url']);
        $this->assertSame($remoteHub->id, $raise['data']['source_location_id']);
        $this->assertSame((string) $variant->id, $raise['fields'][0]['options'][0]['value']);

        // Sellers have no transfers desk.
        $this->assertNull($this->station($this->stations($this->user('seller'), 'seller'), 'moves'));
    }

    #[Test]
    public function every_app_gets_its_desks_without_error_even_when_nothing_is_waiting(): void
    {
        $expected = [
            'stock_keeper' => ['receiving', 'arrivals', 'orders', 'counts', 'moves', 'stock_pages', 'work', 'office', 'shipments'],
            'seller' => ['orders', 'payments', 'counter', 'customers', 'ideas', 'work', 'office'],
            'delivery' => ['delivery', 'work', 'office', 'shipments'],
            'admin' => ['counts', 'delivery', 'payments', 'purchase_orders', 'expenses', 'counter', 'customers', 'catalogue', 'network', 'ideas', 'work', 'office', 'proposals'],
        ];

        foreach ($expected as $app => $keys) {
            $viewer = $this->user($app === 'admin' ? 'admin' : $app, $app === 'admin' ? null : $this->store->id);
            $found = array_column($this->stations($viewer, $app), 'key');
            foreach ($keys as $key) {
                $this->assertContains($key, $found, "{$app} should have the {$key} desk");
            }
            foreach ($this->stations($viewer, $app) as $station) {
                $this->assertNotEmpty($station['desk'], "{$app}/{$station['key']} names its desk");
                foreach ($station['items'] as $item) {
                    foreach ($item['actions'] as $action) {
                        $this->assertStringStartsWith('/', $action['url'], "{$app}/{$station['key']} action url is a path");
                        $this->assertContains($action['method'], ['post', 'put', 'patch', 'delete']);
                    }
                }
            }
        }
    }

    #[Test]
    public function the_delivery_desk_offers_a_courier_the_pool_and_their_next_steps_and_an_admin_the_assignment(): void
    {
        $sale = $this->paidOrder();
        $delivery = \App\Models\Fulfillment\Delivery::query()->create(['sale_id' => $sale->id, 'tracking_number' => 'DLV-GUIDE-1', 'status' => 'pending', 'delivery_address' => 'Bole', 'recipient_name' => 'Abebe', 'method' => 'courier']);
        $sale->update(['sourcing_confirmed_at' => now()]);

        $courier = $this->user('delivery');
        $desk = $this->station($this->stations($courier, 'delivery'), 'delivery');
        $this->assertSame('desk_bay', $desk['desk']);
        $this->assertSame('claim', $desk['items'][0]['actions'][0]['key']);
        $this->assertSame(route('delivery.delivery.claim', $delivery->id, false), $desk['items'][0]['actions'][0]['url']);

        // Taken: it is theirs, with its next steps (and a reason is asked for when it fails).
        app(\App\Services\DeliveryService::class)->claim($delivery, $courier);
        $mine = $this->station($this->stations($courier, 'delivery'), 'delivery')['items'][0];
        $this->assertContains('dispatched', array_column($mine['actions'], 'key'));
        $failed = collect($mine['actions'])->firstWhere('key', 'failed');
        $this->assertSame('failure_reason', $failed['fields'][0]['name']);
        $this->assertSame('patch', $failed['method']);

        // An admin sees the open run and can put a courier on an unassigned one.
        $delivery->update(['courier_id' => null]);
        $admin = $this->station($this->stations($this->user('admin', null), 'admin'), 'delivery');
        $this->assertSame('assign', $admin['items'][0]['actions'][0]['key']);
        $this->assertSame((string) $courier->id, $admin['items'][0]['actions'][0]['fields'][0]['options'][0]['value']);
    }

    #[Test]
    public function the_shipments_desk_offers_to_agree_a_slot_and_a_courier_to_claim_a_dispatched_load(): void
    {
        $tree = app(\App\Services\Inventory\StockLocationTree::class);
        $hub = $tree->syncStore(Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]));
        $shipment = \App\Models\Fulfillment\Shipment::query()->create([
            'reference' => 'SHP-GUIDE-1', 'origin_store_id' => $hub->legacy_id, 'destination_store_id' => $this->store->id,
            'origin_stock_location_id' => $hub->id, 'destination_stock_location_id' => $this->shelf->id,
            'status' => 'pending_agreement', 'schedule_options' => ['2026-11-01T09:00', '2026-11-02T09:00'],
        ]);

        $admin = $this->station($this->stations($this->user('admin', null), 'admin'), 'shipments');
        $this->assertSame('desk_shipments', $admin['desk']);
        $agree = $admin['items'][0]['actions'][0];
        $this->assertSame(route('admin.inventory.shipments.agree', $shipment->id, false), $agree['url']);
        $this->assertSame(['2026-11-01T09:00', '2026-11-02T09:00'], array_column($agree['fields'][0]['options'], 'value'));

        // Dispatched and without a courier: a courier may take it.
        $shipment->update(['status' => 'dispatched']);
        $courier = $this->user('delivery');
        $courier->update(['is_driver' => true]);
        $claim = $this->station($this->stations($courier, 'delivery'), 'shipments')['items'][0]['actions'][0];
        $this->assertSame('claim', $claim['key']);
        $this->assertSame(route('delivery.shipments.claim', $shipment->id, false), $claim['url']);
    }
}
