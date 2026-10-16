<?php

declare(strict_types=1);

namespace Tests\Feature\Shipment;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Fulfillment\Vehicle;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\ShipmentWorkflowService as Workflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The seller's shipment screens when the service says no: raising a run that
 * misses their store, and editing a run whose manifest has frozen. Also the
 * fleet fields on Save manifest.
 */
class SellerShipmentRefusalsTest extends TestCase
{
    use RefreshDatabase;

    private const SLOT = '2026-12-01T08:30';

    private Store $hub;

    private Store $depot;

    private Store $elsewhere;

    private User $seller;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->hub = Store::factory()->create(['name' => 'Central Hub', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $this->depot = Store::factory()->create(['name' => 'Kality Depot', 'type' => Store::TYPE_REMOTE_WAREHOUSE]);
        $this->elsewhere = Store::factory()->create(['name' => 'Bole Depot', 'type' => Store::TYPE_REMOTE_WAREHOUSE]);

        $this->seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->depot->id]);
        $this->seller->assignRole('seller');
        $this->variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create(['status' => 'active'])->id]);

        $this->withServerVariables(['HTTP_HOST' => 'seller.localhost']);
        $this->actingAs($this->seller->refresh());
    }

    private function openRun(): Shipment
    {
        $workflow = app(Workflow::class);
        $shipment = $workflow->create($this->hub->id, $this->depot->id, ['scheduled_for' => self::SLOT], $this->seller->id);
        $workflow->addItem($shipment->fresh(), $this->variant, 10);

        return $shipment->fresh();
    }

    private function frozen(): Shipment
    {
        $shipment = $this->openRun();
        $shipment->forceFill(['status' => Workflow::PICKING])->save();

        return $shipment->fresh();
    }

    #[Test]
    public function a_seller_cannot_raise_a_run_that_misses_their_store(): void
    {
        $this->post(route('seller.shipments.store'), [
            'origin_store_id' => $this->hub->id, 'destination_store_id' => $this->elsewhere->id, 'scheduled_for' => self::SLOT,
        ])->assertSessionHasErrors(['destination_location_id' => 'A shipment must end at your own store or its Remote Hub.']);

        $this->assertSame(0, Shipment::query()->count());
    }

    #[Test]
    public function a_seller_raises_a_run_into_their_own_store(): void
    {
        $response = $this->post(route('seller.shipments.store'), [
            'origin_store_id' => $this->hub->id, 'destination_store_id' => $this->depot->id, 'scheduled_for' => self::SLOT, 'notes' => 'paint for the weekend',
        ]);

        $shipment = Shipment::query()->sole();
        $response->assertRedirect(route('seller.shipments.show', $shipment))->assertSessionHas('success');
        $this->assertSame($this->depot->id, (int) $shipment->destination_store_id);
        $this->assertSame('paint for the weekend', $shipment->notes);
        $this->assertSame($this->seller->id, (int) $shipment->created_by);
    }

    #[Test]
    public function a_frozen_manifest_refuses_every_edit_with_the_reason(): void
    {
        $shipment = $this->frozen();
        $from = route('seller.shipments.show', $shipment);

        $this->from($from)->post(route('seller.shipments.manifest.save', $shipment), ['quantities' => [$this->variant->id => 3]])
            ->assertRedirect($from)->assertSessionHas('error', 'The manifest is locked once picking has started.');
        $this->from($from)->post(route('seller.shipments.items.store', $shipment), ['item_variant_id' => $this->variant->id, 'quantity' => 1])
            ->assertSessionHas('error', 'The manifest is locked once picking has started.');
        $this->from($from)->post(route('seller.shipments.items.bulk', $shipment), ['lines' => [['item_variant_id' => $this->variant->id, 'quantity' => 1]]])
            ->assertSessionHas('error', 'The manifest is locked once picking has started.');
        $this->from($from)->patch(route('seller.shipments.route.update', $shipment), ['destination_store_id' => $this->depot->id, 'origin_store_id' => $this->hub->id])
            ->assertSessionHas('error', 'The route is fixed once picking has started.');

        $this->assertSame(10, (int) $shipment->items()->sole()->quantity);
    }

    #[Test]
    public function saving_the_manifest_sets_the_fleet_car_and_drivers(): void
    {
        $shipment = $this->openRun();
        $car = Vehicle::factory()->create(['name' => 'Isuzu', 'plate' => 'AA-2', 'max_cbm' => 20]);
        $driver = User::factory()->create(['role' => 'delivery', 'is_driver' => true]);
        $driver->assignRole('delivery');

        $this->post(route('seller.shipments.manifest.save', $shipment), ['vehicle_id' => $car->id, 'courier_ids' => [$driver->id]])
            ->assertSessionHas('success', 'Manifest saved.');

        $shipment->refresh();
        $this->assertSame($car->id, (int) $shipment->vehicle_id);
        $this->assertSame('Isuzu', $shipment->vehicle_name);
        $this->assertSame([$driver->id], $shipment->eligibleCourierIds());

        // Dropping the car keeps the drivers.
        $this->post(route('seller.shipments.manifest.save', $shipment), ['vehicle_id' => null])->assertSessionHas('success');
        $this->assertNull($shipment->fresh()->vehicle_id);
        $this->assertSame([$driver->id], $shipment->fresh()->eligibleCourierIds());
    }

    #[Test]
    public function a_bad_new_slot_on_save_is_refused_with_the_reason(): void
    {
        $shipment = $this->openRun();

        $this->post(route('seller.shipments.manifest.save', $shipment), ['scheduled_run' => 'not a date'])
            ->assertSessionHasErrors('scheduled_run');
    }
}
