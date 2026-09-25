<?php

declare(strict_types=1);

namespace Tests\Feature\Shipment;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Services\ShipmentWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * One shipment, four roles.
 *
 *   Admin        draft ──► scheduled
 *   StockKeeper  scheduled ──► picking ──► ready ──► dispatched   (stock OUT)
 *   Delivery     dispatched ──► in_transit ──► delivered
 *   Seller       delivered ──► received                            (stock IN)
 *
 * The invariant under test: a unit is in exactly one place at a time. It
 * leaves the origin at dispatch and appears at the destination only on receipt.
 */
class CrossRoleShipmentTest extends TestCase
{
    use RefreshDatabase;

    private Store $origin;

    private Store $destination;

    private User $admin;

    private User $stockKeeper;

    private User $courier;

    private User $seller;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'stock_keeper', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->origin = Store::factory()->create(['name' => 'Central Hub']);
        $this->destination = Store::factory()->create(['name' => 'Main Store']);

        $this->admin = $this->userWithRole('admin', null);
        $this->stockKeeper = $this->userWithRole('stock_keeper', $this->origin->id);
        $this->courier = $this->userWithRole('delivery', null);
        $this->seller = $this->userWithRole('seller', $this->destination->id);

        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->setStock($this->origin, 100);
    }

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

    private function userWithRole(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    /** Each role lives on its own subdomain. */
    private function asRole(User $user, string $subdomain): self
    {
        $this->withServerVariables(['HTTP_HOST' => "{$subdomain}.localhost"]);
        $this->actingAs($user, 'web');

        return $this;
    }

    private function setStock(Store $store, int $quantity): void
    {
        ItemStock::updateOrCreate(
            [
                'item_variant_id' => $this->variant->id,
                'location_type' => Store::class,
                'location_id' => $store->id,
            ],
            ['quantity' => $quantity, 'min_stock_level' => 0],
        );
    }

    private function stockAt(Store $store): int
    {
        return (int) ItemStock::query()
            ->where('item_variant_id', $this->variant->id)
            ->where('location_type', Store::class)
            ->where('location_id', $store->id)
            ->sum('quantity');
    }

    /** A shipment already sitting at a given status, built through the service. */
    private function shipmentAt(string $status, int $quantity = 30): Shipment
    {
        $workflow = app(ShipmentWorkflowService::class);

        $shipment = $workflow->create(
            $this->origin->id,
            $this->destination->id,
            ['vehicle_name' => 'Isuzu NPR', 'vehicle_plate' => 'ET-3-9482', 'vehicle_max_cbm' => 14.5],
            $this->admin->id,
        );

        $workflow->addItem($shipment, $this->variant, $quantity, ['cbm' => 1.8, 'weight_kg' => 480]);

        $path = [
            ShipmentWorkflowService::SCHEDULED,
            ShipmentWorkflowService::PICKING,
            ShipmentWorkflowService::READY,
            ShipmentWorkflowService::DISPATCHED,
            ShipmentWorkflowService::IN_TRANSIT,
            ShipmentWorkflowService::DELIVERED,
            ShipmentWorkflowService::RECEIVED,
        ];

        foreach ($path as $next) {
            if ($shipment->status === $status) {
                break;
            }
            $shipment = $workflow->transition($shipment, $next);
        }

        return $shipment->refresh();
    }

    /* =====================================================================
     | The full cross-role journey
     |====================================================================*/

    #[Test]
    public function a_shipment_travels_the_whole_way_across_four_roles(): void
    {
        $workflow = app(ShipmentWorkflowService::class);

        // ── ADMIN: open a run and build the manifest ──
        $this->asRole($this->admin, 'admin')
            ->post(route('admin.inventory.shipments.store'), [
                'origin_store_id' => $this->origin->id,
                'destination_store_id' => $this->destination->id,
                'vehicle_name' => 'Isuzu NPR',
            ])->assertRedirect();

        $shipment = Shipment::firstOrFail();
        $this->assertSame(ShipmentWorkflowService::DRAFT, $shipment->status);

        $this->asRole($this->admin, 'admin')
            ->post(route('admin.inventory.shipments.items.store', $shipment), [
                'item_variant_id' => $this->variant->id,
                'quantity' => 30,
                'cbm' => 1.8,
            ])->assertSessionHasNoErrors();

        $this->assertSame(1, $shipment->fresh()->items()->count());

        // Admin schedules it.
        $this->asRole($this->admin, 'admin')
            ->patch(route('admin.inventory.shipments.transition', $shipment), [
                'status' => ShipmentWorkflowService::SCHEDULED,
            ])->assertSessionHasNoErrors();

        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->fresh()->status);
        $this->assertSame(100, $this->stockAt($this->origin), 'Scheduling must not move stock.');

        // ── STOCKKEEPER: pick, ready, dispatch ──
        $this->asRole($this->stockKeeper, 'stockkeeper')
            ->post(route('stock_keeper.shipments.pick', $shipment), [
                'picked' => [$this->variant->id => 30],
            ])->assertSessionHasNoErrors();

        $this->assertSame(ShipmentWorkflowService::PICKING, $shipment->fresh()->status);
        $this->assertSame(30, (int) $shipment->fresh()->items()->first()->picked_quantity);

        foreach ([ShipmentWorkflowService::READY, ShipmentWorkflowService::DISPATCHED] as $next) {
            $this->asRole($this->stockKeeper, 'stockkeeper')
                ->patch(route('stock_keeper.shipments.transition', $shipment), ['status' => $next])
                ->assertSessionHasNoErrors();
        }

        $this->assertSame(ShipmentWorkflowService::DISPATCHED, $shipment->fresh()->status);

        // Stock has LEFT the origin and has NOT yet arrived.
        $this->assertSame(70, $this->stockAt($this->origin), 'Origin must be debited at dispatch.');
        $this->assertSame(0, $this->stockAt($this->destination), 'Destination must not be credited yet.');

        // ── DELIVERY: claim, carry, hand over ──
        $this->asRole($this->courier, 'delivery')
            ->post(route('delivery.shipments.claim', $shipment))
            ->assertSessionHasNoErrors();

        $this->assertSame($this->courier->id, $shipment->fresh()->courier_id);

        foreach ([ShipmentWorkflowService::IN_TRANSIT, ShipmentWorkflowService::DELIVERED] as $next) {
            $this->asRole($this->courier, 'delivery')
                ->patch(route('delivery.shipments.transition', $shipment), ['status' => $next])
                ->assertSessionHasNoErrors();
        }

        $this->assertSame(ShipmentWorkflowService::DELIVERED, $shipment->fresh()->status);
        $this->assertSame(0, $this->stockAt($this->destination), 'Delivery alone must not credit stock.');

        // ── SELLER: confirm receipt ──
        $this->asRole($this->seller, 'seller')
            ->patch(route('seller.shipments.transition', $shipment), [
                'status' => ShipmentWorkflowService::RECEIVED,
            ])->assertSessionHasNoErrors();

        $shipment = $shipment->fresh();
        $this->assertSame(ShipmentWorkflowService::RECEIVED, $shipment->status);

        // The invariant: 100 units total, now split 70 / 30.
        $this->assertSame(70, $this->stockAt($this->origin));
        $this->assertSame(30, $this->stockAt($this->destination));
        $this->assertSame(100, $this->stockAt($this->origin) + $this->stockAt($this->destination));

        // Every stage is timestamped.
        foreach (['dispatched_at', 'in_transit_at', 'delivered_at', 'received_at'] as $stamp) {
            $this->assertNotNull($shipment->{$stamp}, "{$stamp} should be stamped.");
        }

        $this->assertEmpty($workflow->allowedTransitions($shipment), 'received is terminal.');
    }

    /* =====================================================================
     | Role boundaries
     |====================================================================*/

    #[Test]
    public function a_courier_cannot_dispatch_a_shipment(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::READY);

        $this->asRole($this->courier, 'delivery')
            ->patch(route('delivery.shipments.transition', $shipment), [
                'status' => ShipmentWorkflowService::DISPATCHED,
            ])->assertForbidden(); // not their run, and not their transition

        $this->assertSame(ShipmentWorkflowService::READY, $shipment->fresh()->status);
        $this->assertSame(100, $this->stockAt($this->origin), 'Stock must not move.');
    }

    #[Test]
    public function a_stock_keeper_cannot_mark_a_shipment_delivered(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::IN_TRANSIT);

        $this->asRole($this->stockKeeper, 'stockkeeper')
            ->patch(route('stock_keeper.shipments.transition', $shipment), [
                'status' => ShipmentWorkflowService::DELIVERED,
            ])->assertSessionHas('error');

        $this->assertSame(ShipmentWorkflowService::IN_TRANSIT, $shipment->fresh()->status);
    }

    #[Test]
    public function a_seller_cannot_pick_a_shipment(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::SCHEDULED);

        $this->asRole($this->seller, 'seller')
            ->patch(route('seller.shipments.transition', $shipment), [
                'status' => ShipmentWorkflowService::PICKING,
            ])->assertSessionHas('error');

        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->fresh()->status);
    }

    #[Test]
    public function a_seller_from_an_unrelated_store_cannot_touch_the_shipment(): void
    {
        $otherStore = Store::factory()->create();
        $outsider = $this->userWithRole('seller', $otherStore->id);

        $shipment = $this->shipmentAt(ShipmentWorkflowService::DELIVERED);

        $this->asRole($outsider, 'seller')
            ->patch(route('seller.shipments.transition', $shipment), [
                'status' => ShipmentWorkflowService::RECEIVED,
            ])->assertForbidden();

        $this->assertSame(ShipmentWorkflowService::DELIVERED, $shipment->fresh()->status);
        $this->assertSame(0, $this->stockAt($this->destination));
    }

    #[Test]
    public function a_courier_cannot_drive_a_run_assigned_to_someone_else(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::DISPATCHED);
        $shipment->update(['courier_id' => $this->courier->id]);

        $otherCourier = $this->userWithRole('delivery', null);

        $this->asRole($otherCourier, 'delivery')
            ->patch(route('delivery.shipments.transition', $shipment), [
                'status' => ShipmentWorkflowService::IN_TRANSIT,
            ])->assertForbidden();

        $this->assertSame(ShipmentWorkflowService::DISPATCHED, $shipment->fresh()->status);
    }

    #[Test]
    public function guests_cannot_drive_a_shipment(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::READY);

        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.localhost']);
        $this->patch(route('stock_keeper.shipments.transition', $shipment), [
            'status' => ShipmentWorkflowService::DISPATCHED,
        ])->assertRedirect(route('stock_keeper.login'));

        $this->assertSame(ShipmentWorkflowService::READY, $shipment->fresh()->status);
    }

    /* =====================================================================
     | State machine & stock integrity
     |====================================================================*/

    #[Test]
    public function a_shipment_cannot_skip_stages(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::SCHEDULED);

        // Admin owns every transition, but the machine still refuses the jump.
        $this->asRole($this->admin, 'admin')
            ->patch(route('admin.inventory.shipments.transition', $shipment), [
                'status' => ShipmentWorkflowService::DELIVERED,
            ])->assertSessionHas('error');

        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->fresh()->status);
    }

    #[Test]
    public function an_empty_manifest_cannot_be_scheduled(): void
    {
        $workflow = app(ShipmentWorkflowService::class);
        $shipment = $workflow->create($this->origin->id, $this->destination->id, [], $this->admin->id);

        $this->asRole($this->admin, 'admin')
            ->patch(route('admin.inventory.shipments.transition', $shipment), [
                'status' => ShipmentWorkflowService::SCHEDULED,
            ])->assertSessionHas('error');

        $this->assertSame(ShipmentWorkflowService::DRAFT, $shipment->fresh()->status);
    }

    #[Test]
    public function cancelling_after_dispatch_returns_the_stock_to_the_origin(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::DISPATCHED);

        $this->assertSame(70, $this->stockAt($this->origin), 'Precondition: stock has left.');

        $this->asRole($this->admin, 'admin')
            ->patch(route('admin.inventory.shipments.transition', $shipment), [
                'status' => ShipmentWorkflowService::CANCELLED,
                'cancel_reason' => 'Vehicle broke down',
            ])->assertSessionHasNoErrors();

        $this->assertSame(ShipmentWorkflowService::CANCELLED, $shipment->fresh()->status);
        $this->assertSame(100, $this->stockAt($this->origin), 'Stock must return to the origin.');
        $this->assertSame(0, $this->stockAt($this->destination));
    }

    #[Test]
    public function cancelling_before_dispatch_does_not_touch_stock(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::SCHEDULED);

        $this->asRole($this->admin, 'admin')
            ->patch(route('admin.inventory.shipments.transition', $shipment), [
                'status' => ShipmentWorkflowService::CANCELLED,
                'cancel_reason' => 'No longer needed',
            ])->assertSessionHasNoErrors();

        $this->assertSame(100, $this->stockAt($this->origin));
    }

    #[Test]
    public function a_short_pick_only_moves_what_was_actually_picked(): void
    {
        $workflow = app(ShipmentWorkflowService::class);
        $shipment = $this->shipmentAt(ShipmentWorkflowService::SCHEDULED, quantity: 30);

        // Only 18 of the 30 were on the shelf.
        $workflow->recordPick($shipment, [$this->variant->id => 18]);
        $shipment = $workflow->transition($shipment->fresh(), ShipmentWorkflowService::READY);
        $shipment = $workflow->transition($shipment, ShipmentWorkflowService::DISPATCHED);

        $this->assertSame(82, $this->stockAt($this->origin), 'Only the picked 18 should leave.');

        $shipment = $workflow->transition($shipment, ShipmentWorkflowService::IN_TRANSIT);
        $shipment = $workflow->transition($shipment, ShipmentWorkflowService::DELIVERED);
        $workflow->transition($shipment, ShipmentWorkflowService::RECEIVED);

        $this->assertSame(18, $this->stockAt($this->destination));
        $this->assertSame(100, $this->stockAt($this->origin) + $this->stockAt($this->destination));
    }

    #[Test]
    public function the_manifest_locks_once_picking_starts(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::PICKING);

        $this->asRole($this->admin, 'admin')
            ->post(route('admin.inventory.shipments.items.store', $shipment), [
                'item_variant_id' => $this->variant->id,
                'quantity' => 5,
            ])->assertSessionHas('error');

        $this->assertSame(30, (int) $shipment->fresh()->items()->first()->quantity);
    }

    /* =====================================================================
     | Validation
     |====================================================================*/

    #[Test]
    public function a_shipment_cannot_start_and_end_at_the_same_store(): void
    {
        $this->asRole($this->admin, 'admin')
            ->post(route('admin.inventory.shipments.store'), [
                'origin_store_id' => $this->origin->id,
                'destination_store_id' => $this->origin->id,
            ])->assertSessionHasErrors('destination_store_id');

        $this->assertSame(0, Shipment::count());
    }

    #[Test]
    public function creating_a_shipment_requires_both_endpoints(): void
    {
        $this->asRole($this->admin, 'admin')
            ->post(route('admin.inventory.shipments.store'), [])
            ->assertSessionHasErrors(['origin_store_id', 'destination_store_id']);
    }

    #[Test]
    public function a_cancellation_must_give_a_reason(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::SCHEDULED);

        $this->asRole($this->admin, 'admin')
            ->patch(route('admin.inventory.shipments.transition', $shipment), [
                'status' => ShipmentWorkflowService::CANCELLED,
            ])->assertSessionHasErrors('cancel_reason');

        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->fresh()->status);
    }

    #[Test]
    public function an_unknown_status_is_rejected(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::SCHEDULED);

        $this->asRole($this->admin, 'admin')
            ->patch(route('admin.inventory.shipments.transition', $shipment), [
                'status' => 'teleported',
            ])->assertSessionHasErrors('status');
    }

    #[Test]
    public function a_manifest_line_requires_a_real_variant_and_positive_quantity(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::DRAFT);

        $this->asRole($this->admin, 'admin')
            ->post(route('admin.inventory.shipments.items.store', $shipment), [
                'item_variant_id' => 999999,
                'quantity' => 0,
            ])->assertSessionHasErrors(['item_variant_id', 'quantity']);
    }

    #[Test]
    public function a_pick_cannot_reference_a_sku_outside_the_manifest(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::SCHEDULED);

        $otherVariant = ItemVariant::factory()->create([
            'item_id' => Item::factory()->create(['status' => 'active'])->id,
        ]);

        $this->asRole($this->stockKeeper, 'stockkeeper')
            ->post(route('stock_keeper.shipments.pick', $shipment), [
                'picked' => [$otherVariant->id => 5],
            ])->assertSessionHasErrors('picked');
    }

    /* =====================================================================
     | Visibility
     |====================================================================*/

    #[Test]
    public function the_seller_sees_inbound_shipments_to_their_store(): void
    {
        $this->shipmentAt(ShipmentWorkflowService::IN_TRANSIT);

        $this->asRole($this->seller, 'seller')
            ->get(route('seller.shipments.index'))
            ->assertOk();
    }

    #[Test]
    public function a_dispatched_run_appears_in_the_courier_pool(): void
    {
        $shipment = $this->shipmentAt(ShipmentWorkflowService::DISPATCHED);

        $this->assertTrue(
            Shipment::query()->claimable()->whereKey($shipment->id)->exists(),
            'An unclaimed dispatched run should be claimable.'
        );

        app(ShipmentWorkflowService::class)->claim($shipment, $this->courier);

        $this->assertFalse(
            Shipment::query()->claimable()->whereKey($shipment->id)->exists(),
            'A claimed run must leave the pool.'
        );
    }
}
