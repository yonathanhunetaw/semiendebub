<?php

declare(strict_types=1);

namespace Tests\Feature\Shipment;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Fulfillment\Vehicle;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\ShipmentWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The creator picks the car from the fleet and the drivers a run is offered
 * to. Only those drivers see the run and may agree to a window; once the
 * driver and both docks agree, the run is scheduled with no review step.
 */
class ShipmentFleetTest extends TestCase
{
    use RefreshDatabase;

    private const SLOT = '2026-11-02T08:30';

    private ShipmentWorkflowService $workflow;

    private Store $origin;

    private Store $destination;

    private User $admin;

    private User $offered;

    private User $other;

    private User $originKeeper;

    private User $destinationKeeper;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->workflow = app(ShipmentWorkflowService::class);

        foreach (['admin', 'seller', 'stock_keeper', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->origin = Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $this->destination = Store::factory()->create(['name' => 'Kality Depot', 'type' => Store::TYPE_REMOTE_WAREHOUSE]);

        $this->admin = $this->user('admin', null);
        $this->offered = $this->user('delivery', null);
        $this->other = $this->user('delivery', null);
        $this->originKeeper = $this->user('stock_keeper', $this->origin->id);
        $this->destinationKeeper = $this->user('stock_keeper', $this->destination->id);

        $this->variant = ItemVariant::factory()->create([
            'item_id' => Item::factory()->create(['status' => 'active'])->id,
        ]);
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    private function openRun(): Shipment
    {
        $shipment = $this->workflow->create(
            $this->origin->id,
            $this->destination->id,
            ['scheduled_for' => self::SLOT],
            $this->admin->id,
        );

        $this->workflow->addItem($shipment->fresh(), $this->variant, 10, ['cbm' => 1.0]);

        return $shipment->fresh();
    }

    #[Test]
    public function picking_a_car_copies_its_details_onto_the_run(): void
    {
        $car = Vehicle::factory()->create(['name' => 'Isuzu FSR', 'plate' => 'AA-3-12345', 'max_cbm' => 24]);

        $shipment = $this->workflow->assignFleet($this->openRun(), $car->id, []);

        $this->assertSame($car->id, (int) $shipment->vehicle_id);
        $this->assertSame('Isuzu FSR', $shipment->vehicle_name);
        $this->assertSame('AA-3-12345', $shipment->vehicle_plate);
        $this->assertSame(24.0, (float) $shipment->vehicle_max_cbm);
    }

    #[Test]
    public function only_the_offered_drivers_see_the_run_and_may_agree(): void
    {
        $shipment = $this->workflow->assignFleet($this->openRun(), null, [$this->offered->id]);

        $this->assertTrue($this->workflow->isVisibleTo($shipment, $this->offered));
        $this->assertFalse($this->workflow->isVisibleTo($shipment, $this->other));

        $this->assertContains('fleet', $this->workflow->partiesFor($shipment, $this->offered));
        $this->assertNotContains('fleet', $this->workflow->partiesFor($shipment, $this->other));

        $this->withServerVariables(['HTTP_HOST' => 'delivery.localhost'])
            ->actingAs($this->other, 'web')
            ->post(route('delivery.shipments.agree', $shipment), ['party' => 'fleet', 'slot' => self::SLOT])
            ->assertForbidden();
    }

    #[Test]
    public function a_run_with_no_drivers_picked_is_open_to_every_driver(): void
    {
        $shipment = $this->openRun();

        $this->assertTrue($this->workflow->isVisibleTo($shipment, $this->offered));
        $this->assertTrue($this->workflow->isVisibleTo($shipment, $this->other));
    }

    #[Test]
    public function the_run_schedules_itself_once_the_driver_and_both_docks_agree(): void
    {
        $shipment = $this->workflow->assignFleet($this->openRun(), null, [$this->offered->id]);

        $shipment = $this->workflow->recordPartyAgreement($shipment, 'fleet', self::SLOT, $this->offered);
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'origin', self::SLOT, $this->originKeeper);
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'destination', self::SLOT, $this->destinationKeeper);

        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->status);
        $this->assertSame($this->offered->id, (int) $shipment->courier_id);
    }

    #[Test]
    public function dropping_the_agreed_driver_withdraws_the_fleet_tick(): void
    {
        $shipment = $this->workflow->assignFleet($this->openRun(), null, [$this->offered->id, $this->other->id]);
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'fleet', self::SLOT, $this->offered);
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'origin', self::SLOT, $this->originKeeper);
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'destination', self::SLOT, $this->destinationKeeper);
        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->status);

        $shipment = $this->workflow->assignFleet($shipment, null, [$this->other->id]);

        $this->assertSame(ShipmentWorkflowService::PENDING_AGREEMENT, $shipment->status);
        $this->assertNull($shipment->courier_id);
        $this->assertSame('pending', $this->workflow->agreements($shipment)['fleet']['status']);
        $this->assertSame('accepted', $this->workflow->agreements($shipment)['origin']['status']);
    }

    #[Test]
    public function only_delivery_drivers_can_be_offered_a_run(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->workflow->assignFleet($this->openRun(), null, [$this->originKeeper->id]);
    }

    #[Test]
    public function admin_saves_the_car_and_drivers_from_the_shipment_page(): void
    {
        $car = Vehicle::factory()->create();
        $shipment = $this->openRun();

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')])
            ->actingAs($this->admin, 'web')
            ->patch(route('admin.inventory.shipments.fleet', $shipment), [
                'vehicle_id' => $car->id,
                'courier_ids' => [$this->offered->id],
            ])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('success');

        $shipment = $shipment->fresh();
        $this->assertSame($car->id, (int) $shipment->vehicle_id);
        $this->assertSame([$this->offered->id], $shipment->eligibleCourierIds());
    }

    #[Test]
    public function admin_manages_the_fleet_and_cannot_delete_a_car_on_an_open_run(): void
    {
        $host = ['HTTP_HOST' => 'admin.'.config('app.system_domain')];

        $this->withServerVariables($host)->actingAs($this->admin, 'web')
            ->post(route('admin.inventory.fleet.store'), [
                'name' => 'Hino 300',
                'plate' => 'AA-3-99999',
                'max_cbm' => 18,
                'payload_kg' => null,
                'status' => 'active',
            ])
            ->assertSessionHasNoErrors();

        $car = Vehicle::query()->where('plate', 'AA-3-99999')->sole();
        $this->assertSame(0, $car->payload_kg);

        $this->workflow->assignFleet($this->openRun(), $car->id, []);

        $this->withServerVariables($host)->actingAs($this->admin, 'web')
            ->delete(route('admin.inventory.fleet.destroy', $car))
            ->assertSessionHas('error');

        $this->assertNotNull($car->fresh());
    }

    #[Test]
    public function a_stock_keeper_assigned_on_the_locations_page_works_that_dock(): void
    {
        $shipment = $this->openRun();
        $keeper = $this->user('stock_keeper', Store::factory()->create()->id);

        $this->assertNotContains('origin', $this->workflow->partiesFor($shipment, $keeper));

        \App\Models\Inventory\LocationStaff::query()->create([
            'stock_location_id' => $shipment->origin_stock_location_id,
            'user_id' => $keeper->id,
        ]);

        $this->assertContains('origin', $this->workflow->partiesFor($shipment->fresh(), $keeper));
        $this->assertTrue($this->workflow->isVisibleTo($shipment, $keeper));
        $this->assertContains(
            $keeper->first_name.' '.$keeper->last_name,
            array_column($this->workflow->presentAgreements($shipment->fresh())['origin']['people'], 'name'),
        );
    }
}
