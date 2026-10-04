<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Exceptions\InsufficientStockException;
use App\Exceptions\MovementDomainException;
use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\InventoryMovement;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\CheckoutService;
use App\Services\DeliveryService;
use App\Services\Fulfillment\OrderSourcingService;
use App\Services\Inventory\StockLocationTree;
use App\Services\ShipmentWorkflowService;
use App\Services\StockService;
use App\Services\TransferWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Every cycle goods travel, with Delivery carrying them between sites
 * (STOCK_PLAN.md phase 4, as the business runs it):
 *
 *   Transfer  Remote Hub → Store: the origin hands the goods to a courier, the
 *             courier hands them to the store. Store floor → shelf needs none.
 *   Shipment  Main Hub A/B → a store and/or a Remote Hub, carried by Delivery.
 *   Customer  Store Shelf / floor / Remote Hub → Delivery → the customer.
 *
 * Goods in a courier's hands sit at the "In Delivery" location, so the
 * network total only changes when stock enters (receive) or leaves (a
 * delivered order) — asserted at every step. Location managers gate who may
 * hand stock out and take it in.
 */
class CustodyCyclesTest extends TestCase
{
    use RefreshDatabase;

    private StockService $stock;

    private Store $store;

    private StockLocation $shelf;

    private StockLocation $floor;

    private StockLocation $remote;

    private StockLocation $hubA;

    private ItemVariant $variant;

    private User $courier;

    private User $keeper;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'stock_keeper', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->stock = app(StockService::class);
        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->shelf = $this->leaf(StockLocation::KIND_SHELF);
        $this->floor = $this->leaf(StockLocation::KIND_BACKROOM);
        $this->remote = app(StockLocationTree::class)->addRemoteHub($this->store);

        // Hub A is a `warehouses` row, as in the real data: not a store.
        $warehouse = Warehouse::create(['name' => 'Main Distribution Hub A', 'code' => 'WH-MAIN-01']);
        $this->hubA = StockLocation::query()->legacy(Warehouse::class, $warehouse->id)->sole();

        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_id' => $item->id,
            'item_variant_id' => $this->variant->id,
            'active' => true,
        ]);

        // Planogram first: the item has a bin on the shelf.
        ShelfItemBand::query()->create([
            'stock_location_id' => $this->shelf->id,
            'item_id' => $item->id,
            'max_units' => 100,
            'refill_units' => 10,
            'critical_units' => 5,
        ]);

        $this->courier = $this->user('delivery');
        $this->keeper = $this->user('stock_keeper');
    }

    /* =====================================================================
     | Transfers
     |====================================================================*/

    #[Test]
    public function remote_hub_to_store_is_handed_to_a_courier_and_then_by_the_courier_to_the_store(): void
    {
        $this->stock->receive($this->variant->id, $this->remote, 50);

        $this->as($this->keeper, 'stockkeeper')
            ->post(route('stock_keeper.transfers.store'), [
                'item_variant_id' => $this->variant->id,
                'quantity' => 20,
                'source_location_type' => StockLocation::class,
                'source_location_id' => $this->remote->id,
                'destination_location_type' => StockLocation::class,
                'destination_location_id' => $this->floor->id,
            ])
            ->assertSessionHasNoErrors();

        $transfer = Transfer::query()->sole();

        // It leaves the site, so it cannot go until a courier carries it.
        $this->as($this->keeper, 'stockkeeper')
            ->post(route('stock_keeper.transfers.dispatch', $transfer))
            ->assertSessionHas('error');
        $this->assertSame(50, $this->at($this->remote));

        $this->as($this->courier, 'delivery')
            ->post(route('delivery.transfers.claim', $transfer))
            ->assertSessionHas('success');

        // The courier sees it as theirs.
        $this->as($this->courier, 'delivery')
            ->get(route('delivery.transfers.index', ['tab' => 'mine']))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('transfers.0.reference', $transfer->reference));

        // Origin → courier.
        $this->as($this->keeper, 'stockkeeper')
            ->post(route('stock_keeper.transfers.dispatch', $transfer))
            ->assertSessionMissing('error');

        $this->assertSame([30, 20, 0], [$this->at($this->remote), $this->custody(), $this->at($this->floor)]);
        $this->assertSame(50, $this->network());

        // Courier → store.
        $this->as($this->courier, 'delivery')
            ->post(route('delivery.transfers.handover', $transfer))
            ->assertSessionHas('success');

        $this->assertSame([30, 0, 20], [$this->at($this->remote), $this->custody(), $this->at($this->floor)]);
        $this->assertSame(TransferWorkflowService::STATUS_COMPLETED, $transfer->fresh()->status);

        // The journal tells the whole story, courier included.
        $journal = InventoryMovement::query()->where('reference_type', $transfer->getMorphClass())
            ->where('reference_id', (string) $transfer->id)->orderBy('id')->get();
        $this->assertSame(['move_out', 'custody_in', 'custody_out', 'move_in'], $journal->pluck('type')->all());
        $this->assertSame($this->courier->id, (int) $journal[1]->destination_id);
        $this->assertSame($this->courier->id, (int) $journal[2]->source_id);
    }

    #[Test]
    public function floor_to_shelf_is_carried_across_by_staff_without_a_courier(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 30);
        $workflow = app(TransferWorkflowService::class);

        $transfer = $this->transfer($this->floor, $this->shelf, 12);
        $this->assertFalse($workflow->needsCourier($transfer));

        $this->assertTrue($workflow->markDispatched($transfer, $this->keeper));
        $this->assertTrue($workflow->markCompleted($transfer->fresh(), $this->keeper));

        $this->assertSame([18, 12, 0], [$this->at($this->floor), $this->at($this->shelf), $this->custody()]);
        $this->assertSame(30, $this->stock->onHandAtStore($this->variant->id, $this->store->id));
    }

    #[Test]
    public function a_transfer_cancelled_in_the_couriers_hands_goes_back_to_the_origin(): void
    {
        $this->stock->receive($this->variant->id, $this->remote, 10);
        $workflow = app(TransferWorkflowService::class);
        $transfer = $this->transfer($this->remote, $this->floor, 10, $this->courier);

        $workflow->markDispatched($transfer, $this->keeper);
        $this->assertSame(10, $this->custody());

        $workflow->cancel($transfer->fresh(), $this->keeper->id);

        $this->assertSame([10, 0, 0], [$this->at($this->remote), $this->custody(), $this->at($this->floor)]);
    }

    #[Test]
    public function only_a_locations_managers_hand_stock_out_of_it_once_it_has_any(): void
    {
        $manager = $this->user('stock_keeper');
        $this->remote->syncManagers([$manager->id]);
        $this->stock->receive($this->variant->id, $this->remote, 10);
        $transfer = $this->transfer($this->remote, $this->floor, 4, $this->courier);

        try {
            app(TransferWorkflowService::class)->markDispatched($transfer, $this->keeper);
            $this->fail('A non-manager handed stock out of a managed location.');
        } catch (MovementDomainException $e) {
            $this->assertStringContainsString('managers', $e->getMessage());
        }

        $this->assertSame(10, $this->at($this->remote));
        $this->assertTrue(app(TransferWorkflowService::class)->markDispatched($transfer->fresh(), $manager));
        $this->assertSame(6, $this->at($this->remote));
    }

    #[Test]
    public function stock_leaving_a_main_hub_is_a_shipment_not_a_transfer(): void
    {
        $this->expectException(MovementDomainException::class);

        $this->transfer($this->hubA, $this->floor, 5);
    }

    /* =====================================================================
     | Shipments
     |====================================================================*/

    #[Test]
    public function hub_a_ships_to_a_store_through_delivery(): void
    {
        $this->stock->receive($this->variant->id, $this->hubA, 100);
        $workflow = app(ShipmentWorkflowService::class);

        $shipment = $workflow->createBetween($this->hubA, $this->floor, [], $this->keeper->id);
        $this->assertNull($shipment->origin_store_id, 'Hub A is not a store.');
        $this->assertSame($this->store->id, (int) $shipment->destination_store_id);

        $workflow->addItem($shipment, $this->variant, 40);
        $this->ready($shipment);

        $workflow->transition($shipment, ShipmentWorkflowService::DISPATCHED);
        $this->assertSame([60, 40, 0], [$this->at($this->hubA), $this->custody(), $this->at($this->floor)]);

        $workflow->transition($shipment->fresh(), ShipmentWorkflowService::IN_TRANSIT);
        $workflow->transition($shipment->fresh(), ShipmentWorkflowService::DELIVERED);
        $this->assertSame(40, $this->custody(), 'Delivered to the dock is still the courier\'s until received.');

        $workflow->transition($shipment->fresh(), ShipmentWorkflowService::RECEIVED);
        $this->assertSame([60, 0, 40], [$this->at($this->hubA), $this->custody(), $this->at($this->floor)]);
        $this->assertSame(100, $this->network());
    }

    #[Test]
    public function hub_a_ships_to_a_remote_hub_and_a_cancelled_load_comes_back(): void
    {
        $this->stock->receive($this->variant->id, $this->hubA, 50);
        $workflow = app(ShipmentWorkflowService::class);

        $shipment = $workflow->createBetween($this->hubA, $this->remote, [], $this->keeper->id);
        $workflow->addItem($shipment, $this->variant, 30);
        $this->ready($shipment);

        $workflow->transition($shipment, ShipmentWorkflowService::DISPATCHED);
        $this->assertSame([20, 30], [$this->at($this->hubA), $this->custody()]);

        $workflow->transition($shipment->fresh(), ShipmentWorkflowService::CANCELLED);
        $this->assertSame([50, 0, 0], [$this->at($this->hubA), $this->custody(), $this->at($this->remote)]);
    }

    #[Test]
    public function a_short_hub_refuses_the_dispatch(): void
    {
        $this->stock->receive($this->variant->id, $this->hubA, 5);
        $workflow = app(ShipmentWorkflowService::class);
        $shipment = $workflow->createBetween($this->hubA, $this->floor, [], $this->keeper->id);
        $workflow->addItem($shipment, $this->variant, 8);
        $this->ready($shipment);

        try {
            $workflow->transition($shipment, ShipmentWorkflowService::DISPATCHED);
            $this->fail('A load bigger than the hub holds was dispatched.');
        } catch (\RuntimeException|InsufficientStockException $e) {
            // The workflow's own pre-check names the line; the gateway would
            // refuse it too.
            $this->assertStringContainsString('needs 8, 5 on hand', $e->getMessage());
        }

        $this->assertSame([5, 0], [$this->at($this->hubA), $this->custody()]);
        $this->assertSame(ShipmentWorkflowService::READY, $shipment->fresh()->status);
    }

    #[Test]
    public function shipments_only_run_from_a_main_hub_to_a_store_or_a_remote_hub(): void
    {
        $workflow = app(ShipmentWorkflowService::class);
        $warehouseB = Warehouse::create(['name' => 'Main Distribution Hub B', 'code' => 'WH-NORTH-02']);
        $hubB = StockLocation::query()->legacy(Warehouse::class, $warehouseB->id)->sole();

        foreach ([[$this->floor, $this->hubA], [$this->remote, $this->floor], [$this->hubA, $hubB], [$this->hubA, $this->shelf]] as [$from, $to]) {
            try {
                $workflow->createBetween($from, $to);
                $this->fail("{$from->name} → {$to->name} must not be a shipment.");
            } catch (MovementDomainException) {
                $this->addToAssertionCount(1);
            }
        }

        $this->assertSame(0, Shipment::query()->count());
    }

    #[Test]
    public function a_hubs_manager_is_its_dock_and_others_cannot_dispatch_from_it(): void
    {
        $hubManager = $this->user('stock_keeper', $this->store->id);
        $this->hubA->syncManagers([$hubManager->id]);
        $this->stock->receive($this->variant->id, $this->hubA, 20);

        $workflow = app(ShipmentWorkflowService::class);
        $shipment = $workflow->createBetween($this->hubA, $this->floor, [], $this->keeper->id);
        $workflow->addItem($shipment, $this->variant, 5);

        // Hub A has no store, so only its managers can act for it.
        $this->assertContains(ShipmentWorkflowService::PARTY_ORIGIN, $workflow->partiesFor($shipment, $hubManager));
        $this->assertTrue($workflow->isVisibleTo($shipment, $hubManager));

        $this->ready($shipment);
        $outsider = $this->user('stock_keeper', $this->store->id);
        $this->actingAs($outsider);

        try {
            $workflow->transition($shipment, ShipmentWorkflowService::DISPATCHED);
            $this->fail('A non-manager dispatched from a managed hub.');
        } catch (MovementDomainException) {
        }

        $this->actingAs($hubManager);
        $workflow->transition($shipment->fresh(), ShipmentWorkflowService::DISPATCHED);
        $this->assertSame(15, $this->at($this->hubA));
    }

    #[Test]
    public function the_receiving_stores_keeper_cannot_dispatch_the_hubs_load(): void
    {
        $this->stock->receive($this->variant->id, $this->hubA, 20);
        $workflow = app(ShipmentWorkflowService::class);
        $shipment = $workflow->createBetween($this->hubA, $this->floor, [], $this->keeper->id);
        $workflow->addItem($shipment, $this->variant, 5);
        $this->ready($shipment);

        $this->actingAs($this->user('stock_keeper', $this->store->id));

        try {
            $workflow->transition($shipment, ShipmentWorkflowService::DISPATCHED);
            $this->fail('The destination store dispatched the hub\'s load.');
        } catch (MovementDomainException $e) {
            $this->assertStringContainsString('origin dock', $e->getMessage());
        }

        $this->assertSame(20, $this->at($this->hubA));
    }

    #[Test]
    public function a_seller_raises_a_shipment_from_hub_a_into_their_store(): void
    {
        $seller = $this->user('seller', $this->store->id);

        $this->as($seller, 'seller')
            ->post(route('seller.shipments.store'), [
                'origin_location_id' => $this->hubA->id,
                'destination_location_id' => $this->floor->id,
                'scheduled_for' => now()->addDay()->format('Y-m-d\TH:i'),
            ])
            ->assertSessionHasNoErrors();

        $shipment = Shipment::query()->sole();
        $this->assertSame([$this->hubA->id, $this->floor->id], [
            (int) $shipment->origin_stock_location_id,
            (int) $shipment->destination_stock_location_id,
        ]);

        // A store cannot ship to a hub.
        $this->as($seller, 'seller')
            ->post(route('seller.shipments.store'), [
                'origin_location_id' => $this->floor->id,
                'destination_location_id' => $this->hubA->id,
            ])
            ->assertSessionHasErrors('destination_location_id');
    }

    /* =====================================================================
     | Customer orders
     |====================================================================*/

    #[Test]
    public function a_customer_order_goes_from_the_shelf_into_delivery_and_out_to_the_customer(): void
    {
        $this->stock->receive($this->variant->id, $this->shelf, 10);

        $sale = $this->paidOrder(3);
        $this->assertSame(7, $this->stock->availableAtStore($this->variant->id, $this->store->id));
        $this->assertSame(10, $this->at($this->shelf), 'Checkout only reserves.');

        $this->pick($sale, $this->shelf);
        $this->assertSame([7, 3], [$this->at($this->shelf), $this->custody()]);
        $this->assertSame(10, $this->network(), 'Picked goods are in Delivery\'s hands, not gone.');

        $delivery = Delivery::query()->where('sale_id', $sale->id)->sole();
        $deliveries = app(DeliveryService::class);
        $this->assertTrue($deliveries->claim($delivery, $this->courier));

        foreach ([DeliveryService::STATUS_DISPATCHED, DeliveryService::STATUS_IN_TRANSIT] as $status) {
            $this->assertTrue($deliveries->transition($delivery->fresh(), $status));
            $this->assertSame(3, $this->custody());
        }

        $this->assertTrue($deliveries->transition($delivery->fresh(), DeliveryService::STATUS_DELIVERED));

        $this->assertSame([7, 0], [$this->at($this->shelf), $this->custody()]);
        $this->assertSame(7, $this->network(), 'Delivered goods have left the network.');
        $this->assertSame(1, InventoryMovement::query()->where('type', 'deliver')->where('quantity', -3)->count());

        // Delivered twice must not hand them over twice.
        $this->assertFalse($deliveries->transition($delivery->fresh(), DeliveryService::STATUS_DELIVERED));
        $this->assertSame(7, $this->network());
    }

    #[Test]
    public function a_returned_order_goes_back_to_where_it_was_picked(): void
    {
        $this->stock->receive($this->variant->id, $this->remote, 10);
        $this->stock->receive($this->variant->id, $this->floor, 5);

        $sale = $this->paidOrder(4);
        $this->pick($sale, $this->remote);
        $this->assertSame([6, 4], [$this->at($this->remote), $this->custody()]);

        $delivery = Delivery::query()->where('sale_id', $sale->id)->sole();
        $deliveries = app(DeliveryService::class);
        $deliveries->claim($delivery, $this->courier);
        $deliveries->transition($delivery->fresh(), DeliveryService::STATUS_DISPATCHED);
        $deliveries->transition($delivery->fresh(), DeliveryService::STATUS_RETURNED);

        $this->assertSame([10, 0], [$this->at($this->remote), $this->custody()]);
        $this->assertSame(15, $this->network());
    }

    #[Test]
    public function a_courier_cannot_collect_an_order_nobody_has_picked(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 5);

        $sale = app(CheckoutService::class)->checkout($this->cart(2), ['payment_method' => 'cash'], null, ['delivery_address' => 'Bole']);
        $delivery = Delivery::query()->where('sale_id', $sale->id)->sole();

        // Not in the pool, and cannot be claimed…
        $this->assertSame(0, app(DeliveryService::class)->paginateUnassigned()->total());
        $this->assertFalse(app(DeliveryService::class)->claim($delivery, $this->courier));

        // …nor started, even if assigned some other way.
        $delivery->update(['courier_id' => $this->courier->id]);
        $this->expectException(MovementDomainException::class);
        app(DeliveryService::class)->transition($delivery->fresh(), DeliveryService::STATUS_DISPATCHED);
    }

    #[Test]
    public function main_hubs_do_not_serve_customers_directly(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 5);
        $this->stock->receive($this->variant->id, $this->hubA, 50);
        $sale = $this->paidOrder(2);

        try {
            $this->pick($sale, $this->hubA);
            $this->fail('A customer order was picked straight from a Main Hub.');
        } catch (MovementDomainException) {
        }

        $this->assertSame([50, 0], [$this->at($this->hubA), $this->custody()]);
    }

    #[Test]
    public function the_custody_log_shows_who_held_the_order_where_and_when(): void
    {
        $this->stock->receive($this->variant->id, $this->shelf, 10);
        $sale = $this->paidOrder(2);
        $this->pick($sale, $this->shelf);

        $delivery = Delivery::query()->where('sale_id', $sale->id)->sole();
        $deliveries = app(DeliveryService::class);
        $deliveries->claim($delivery, $this->courier);
        $this->assertTrue($deliveries->transition($delivery->fresh(), DeliveryService::STATUS_DISPATCHED));
        $this->assertTrue($deliveries->transition($delivery->fresh(), DeliveryService::STATUS_IN_TRANSIT));
        $this->assertTrue($deliveries->transition($delivery->fresh(), DeliveryService::STATUS_DELIVERED));

        $seller = $this->user('seller', $this->store->id);

        $this->as($seller, 'seller')
            ->get(route('seller.orders.custody', ['reference' => $sale->reference_number]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Seller/Orders/Custody')
                ->where('log.reference', $sale->reference_number)
                ->where('log.phase.current', 3)
                ->where('log.lines.0.status', 'delivered')
                ->where('log.lines.0.source.kind', StockLocation::KIND_SHELF)
                ->where('log.events', function ($events): bool {
                    $titles = collect($events)->pluck('title')->all();

                    foreach (['Order placed', 'Payment received', 'Stock reserved', 'Picked from Store Shelf', 'Handed to Delivery', 'Collected by the courier', 'Delivered to the customer'] as $expected) {
                        if (! in_array($expected, $titles, true)) {
                            return false;
                        }
                    }

                    // The hand-off to Delivery names the place and the picker.
                    $handoff = collect($events)->firstWhere('title', 'Picked from Store Shelf');

                    return $handoff['who'] !== null && str_contains((string) $handoff['where'], 'Store Shelf');
                }));

        // Another store's seller cannot read it.
        $other = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $this->as($this->user('seller', $other->id), 'seller')
            ->get(route('seller.orders.custody', ['reference' => $sale->reference_number]))
            ->assertNotFound();
    }

    /* =====================================================================
     | Helpers
     |====================================================================*/

    private function leaf(string $kind): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->store->id)->where('kind', $kind)->sole();
    }

    private function at(StockLocation $leaf): int
    {
        return (int) ItemStock::query()->where('item_variant_id', $this->variant->id)
            ->where('stock_location_id', $leaf->id)->value('quantity');
    }

    private function custody(): int
    {
        return $this->stock->inCustody($this->variant->id);
    }

    private function network(): int
    {
        return (int) ItemStock::query()->where('item_variant_id', $this->variant->id)->sum('quantity');
    }

    private function user(string $role, ?int $storeId = null): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function as(User $user, string $subdomain): self
    {
        $this->withServerVariables(['HTTP_HOST' => $subdomain.'.'.config('app.system_domain')]);
        $this->actingAs($user, 'web');

        return $this;
    }

    private function transfer(StockLocation $from, StockLocation $to, int $quantity, ?User $courier = null): Transfer
    {
        return app(TransferWorkflowService::class)->create(
            variantId: $this->variant->id,
            fromStoreId: null,
            toStoreId: null,
            quantity: $quantity,
            sourceLocationType: StockLocation::class,
            sourceLocationId: $from->id,
            destinationLocationType: StockLocation::class,
            destinationLocationId: $to->id,
            courierId: $courier?->id,
        );
    }

    /** Past the 4-party gate, straight to the floor having picked. */
    private function ready(Shipment $shipment): void
    {
        $shipment->update(['status' => ShipmentWorkflowService::READY]);
        $shipment->refresh();
    }

    private function cart(int $quantity): Cart
    {
        $cart = Cart::create(['store_id' => $this->store->id, 'status' => 'open']);
        $cart->variants()->attach($this->variant->id, ['quantity' => $quantity, 'price' => 100, 'store_id' => $this->store->id]);

        return $cart;
    }

    private function paidOrder(int $quantity): Sale
    {
        return app(CheckoutService::class)->checkout($this->cart($quantity), ['payment_method' => 'cash']);
    }

    private function pick(Sale $sale, StockLocation $from): void
    {
        app(OrderSourcingService::class)->confirmSourcing(
            $sale->fresh(),
            $sale->items->map(fn ($item) => [
                'sale_item_id' => $item->id,
                'location_type' => StockLocation::class,
                'location_id' => $from->id,
            ])->all(),
            $this->keeper,
        );
    }
}
