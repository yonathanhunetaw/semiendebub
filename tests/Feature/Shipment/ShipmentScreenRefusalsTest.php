<?php

declare(strict_types=1);

namespace Tests\Feature\Shipment;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\ShipmentWorkflowService as Workflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Shipment screens refusing what does not apply: a store admin opening a run
 * between other stores, changing the fleet once picking has started, and a
 * stock keeper recording a pick out of order or for a SKU not on the manifest.
 */
class ShipmentScreenRefusalsTest extends TestCase
{
    use RefreshDatabase;

    private Store $hub;

    private Store $depot;

    private Store $elsewhere;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->hub = Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $this->depot = Store::factory()->create(['name' => 'Kality Depot', 'type' => Store::TYPE_REMOTE_WAREHOUSE]);
        $this->elsewhere = Store::factory()->create(['name' => 'Bole Depot', 'type' => Store::TYPE_REMOTE_WAREHOUSE]);
        $this->variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]);
    }

    private function user(string $role, ?Store $store): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $store?->id]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function openRun(string $status): Shipment
    {
        $workflow = app(Workflow::class);
        $shipment = $workflow->create($this->hub->id, $this->depot->id, ['scheduled_for' => '2026-11-02T08:30']);
        $workflow->addItem($shipment->fresh(), $this->variant, 6);
        $shipment->forceFill(['status' => $status])->save();

        return $shipment->fresh();
    }

    #[Test]
    public function a_store_admin_cannot_open_a_run_between_other_stores(): void
    {
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->user('admin', $this->depot));

        $this->post(route('admin.inventory.shipments.store'), [
            'origin_store_id' => $this->hub->id, 'destination_store_id' => $this->elsewhere->id, 'scheduled_for' => '2026-11-02T08:30',
        ])->assertForbidden();
        $this->assertSame(0, Shipment::query()->count());

        $this->post(route('admin.inventory.shipments.store'), [
            'origin_store_id' => $this->hub->id, 'destination_store_id' => $this->depot->id, 'scheduled_for' => '2026-11-02T08:30',
        ])->assertRedirect();
        $this->assertSame(1, Shipment::query()->count());
    }

    #[Test]
    public function the_fleet_cannot_change_once_picking_has_started(): void
    {
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->user('admin', null));
        $shipment = $this->openRun(Workflow::PICKING);

        $this->patch(route('admin.inventory.shipments.fleet', $shipment), ['vehicle_id' => null, 'courier_ids' => []])
            ->assertSessionHas('error', 'The fleet is fixed once picking has started.');
    }

    #[Test]
    public function a_keeper_cannot_pick_an_unscheduled_run_or_a_sku_not_on_it(): void
    {
        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.'.config('app.system_domain')]);
        $this->actingAs($this->user('admin', null));

        $draft = $this->openRun(Workflow::PENDING_AGREEMENT);
        $this->post(route('stock_keeper.shipments.pick', $draft), ['picked' => [$this->variant->id => 6]])
            ->assertSessionHas('error', 'Only a scheduled shipment can be picked.');

        $scheduled = $this->openRun(Workflow::SCHEDULED);
        $stranger = ItemVariant::factory()->create(['item_id' => $this->variant->item_id]);
        $this->post(route('stock_keeper.shipments.pick', $scheduled), ['picked' => [$stranger->id => 1]])
            ->assertSessionHasErrors(['picked' => 'That SKU is not on this manifest.']);
        $this->assertSame(Workflow::SCHEDULED, $scheduled->fresh()->status);
    }
}
