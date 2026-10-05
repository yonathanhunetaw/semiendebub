<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

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

/** Admin → Shipments: agree, hand over, receive and take lines off a manifest. */
class AdminShipmentActionsTest extends TestCase
{
    use RefreshDatabase;

    private const SLOT = '2026-12-01T08:30';

    private Store $origin;

    private Store $destination;

    private User $admin;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'stock_keeper', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->origin = Store::factory()->create(['name' => 'Central Hub', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $this->destination = Store::factory()->create(['name' => 'Kality Depot', 'type' => Store::TYPE_REMOTE_WAREHOUSE]);

        $this->admin = $this->user('admin', null);
        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        ItemStock::updateOrCreate(
            ['item_variant_id' => $this->variant->id, 'location_type' => Store::class, 'location_id' => $this->origin->id],
            ['quantity' => 100, 'min_stock_level' => 0],
        );

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->admin);
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    private function stockAt(Store $store): int
    {
        return (int) ItemStock::query()
            ->where('item_variant_id', $this->variant->id)
            ->where('location_type', Store::class)
            ->where('location_id', $store->id)
            ->sum('quantity');
    }

    /** A shipment at `draft`, `pending_agreement` or `scheduled`, with 30 units on the manifest. */
    private function shipment(string $state = 'draft'): Shipment
    {
        $workflow = app(ShipmentWorkflowService::class);

        $shipment = $workflow->create(
            $this->origin->id,
            $this->destination->id,
            $state === 'draft' ? [] : ['scheduled_for' => self::SLOT],
            $this->admin->id,
        );
        $workflow->addItem($shipment->fresh(), $this->variant, 30, ['cbm' => 1.8, 'weight_kg' => 480]);
        $shipment = $shipment->fresh();

        if ($state === 'scheduled') {
            foreach ([
                ['creator', $this->admin],
                ['fleet', $this->user('delivery', null)],
                ['origin', $this->user('stock_keeper', $this->origin->id)],
                ['destination', $this->user('seller', $this->destination->id)],
            ] as [$party, $actor]) {
                $shipment = $workflow->recordPartyAgreement($shipment->fresh(), $party, self::SLOT, $actor);
            }
        }

        return $shipment->fresh();
    }

    #[Test]
    public function the_board_and_a_shipment_page_open(): void
    {
        $shipment = $this->shipment();

        $this->get(route('admin.inventory.shipments.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Inventory/Shipments/index')->where('counts.draft', 1));
        $this->get(route('admin.inventory.shipments.show', $shipment))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Inventory/Shipments/Show'));
    }

    #[Test]
    public function the_board_filters_by_status(): void
    {
        $this->shipment('draft');

        $this->get(route('admin.inventory.shipments.index', ['status' => 'received']))->assertOk()
            ->assertInertia(fn ($page) => $page->where('shipments', fn ($rows) => count($rows) === 0));
        $this->get(route('admin.inventory.shipments.index', ['status' => 'open']))->assertOk()
            ->assertInertia(fn ($page) => $page->where('shipments', fn ($rows) => count($rows) === 1));
    }

    #[Test]
    public function the_admin_ticks_the_creator_agreement_on_a_slot(): void
    {
        $shipment = $this->shipment('pending_agreement');

        $this->post(route('admin.inventory.shipments.agree', $shipment), ['slot' => self::SLOT])
            ->assertSessionHasNoErrors()->assertSessionHas('success');
    }

    #[Test]
    public function agreeing_needs_a_slot(): void
    {
        $shipment = $this->shipment('pending_agreement');

        $this->post(route('admin.inventory.shipments.agree', $shipment), [])->assertSessionHasErrors('slot');
    }

    #[Test]
    public function the_origin_hands_over_and_stock_leaves_the_origin_ledger(): void
    {
        $shipment = $this->shipment('scheduled');
        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->status);

        $this->post(route('admin.inventory.shipments.handover', $shipment))->assertSessionHas('success');

        $this->assertSame(ShipmentWorkflowService::DISPATCHED, $shipment->fresh()->status);
        $this->assertSame(70, $this->stockAt($this->origin));
        $this->assertSame(0, $this->stockAt($this->destination), 'nothing is credited until receipt');
    }

    #[Test]
    public function the_destination_receives_and_stock_is_credited_there(): void
    {
        $shipment = $this->shipment('scheduled');
        $this->post(route('admin.inventory.shipments.handover', $shipment));

        $this->post(route('admin.inventory.shipments.receive', $shipment))->assertSessionHas('success');

        $this->assertSame(ShipmentWorkflowService::RECEIVED, $shipment->fresh()->status);
        $this->assertSame(70, $this->stockAt($this->origin));
        $this->assertSame(30, $this->stockAt($this->destination));
    }

    #[Test]
    public function a_draft_cannot_be_handed_over_or_received_and_no_stock_moves(): void
    {
        $shipment = $this->shipment('draft');

        $this->post(route('admin.inventory.shipments.handover', $shipment));
        $this->post(route('admin.inventory.shipments.receive', $shipment));

        // advanceTo() walks a draft as far as the agreement gate and stops there.
        $this->assertNotContains($shipment->fresh()->status, [
            ShipmentWorkflowService::DISPATCHED,
            ShipmentWorkflowService::RECEIVED,
        ]);
        $this->assertSame(100, $this->stockAt($this->origin));
        $this->assertSame(0, $this->stockAt($this->destination));
    }

    #[Test]
    public function a_received_shipment_cannot_be_received_twice(): void
    {
        $shipment = $this->shipment('scheduled');
        $this->post(route('admin.inventory.shipments.handover', $shipment));
        $this->post(route('admin.inventory.shipments.receive', $shipment));

        $this->post(route('admin.inventory.shipments.receive', $shipment));

        $this->assertSame(30, $this->stockAt($this->destination), 'a second receipt must not credit again');
    }

    #[Test]
    public function a_line_comes_off_an_open_manifest(): void
    {
        $shipment = $this->shipment('draft');
        $this->assertCount(1, $shipment->items);

        $this->delete(route('admin.inventory.shipments.items.destroy', [$shipment, $this->variant]))
            ->assertSessionHas('success');

        $this->assertCount(0, $shipment->fresh()->items);
    }

    #[Test]
    public function a_line_cannot_come_off_a_locked_manifest(): void
    {
        $shipment = $this->shipment('scheduled');
        app(ShipmentWorkflowService::class)->transition($shipment, ShipmentWorkflowService::PICKING);

        $this->delete(route('admin.inventory.shipments.items.destroy', [$shipment, $this->variant]))
            ->assertSessionHas('error');

        $this->assertCount(1, $shipment->fresh()->items);
    }
}
