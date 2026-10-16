<?php

declare(strict_types=1);

namespace Tests\Feature\Shipment;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\Fulfillment\ShipmentHandoffService as Handoff;
use App\Services\ShipmentWorkflowService as Workflow;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The hand-off steps (pick, prepare, the driver's trip, the receiver's
 * signature) refuse, with a reason a person can act on, whenever the run is
 * not at that step, the wrong person asks, or the input is bad.
 */
class ShipmentHandoffRefusalsTest extends TestCase
{
    use RefreshDatabase;

    private Handoff $handoff;

    private User $admin;

    private ItemVariant $variant;

    private Shipment $shipment;

    protected function setUp(): void
    {
        parent::setUp();

        $this->handoff = app(Handoff::class);
        $hub = Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $depot = Store::factory()->create(['name' => 'Kality Depot', 'type' => Store::TYPE_REMOTE_WAREHOUSE]);
        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');
        $this->admin->refresh();
        $this->variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]);

        $workflow = app(Workflow::class);
        $this->shipment = $workflow->create($hub->id, $depot->id, ['scheduled_for' => '2026-11-02T08:30'], $this->admin->id);
        $workflow->addItem($this->shipment->fresh(), $this->variant, 4);
        $this->shipment = $this->shipment->fresh();
    }

    private function at(string $status, array $stamps = []): Shipment
    {
        $this->shipment->forceFill(['status' => $status] + $stamps)->save();

        return $this->shipment->fresh();
    }

    private function refusal(Shipment $shipment, string $step, array $payload = [], ?User $user = null): string
    {
        try {
            $this->handoff->perform($shipment, $step, $user ?? $this->admin, $payload);
        } catch (\RuntimeException|\InvalidArgumentException|AuthorizationException $e) {
            return $e->getMessage();
        }

        $this->fail("{$step} was not refused.");
    }

    #[Test]
    public function an_unknown_step_is_refused(): void
    {
        $this->assertSame('Unknown step [teleport].', $this->refusal($this->shipment, 'teleport'));
    }

    #[Test]
    public function each_step_says_why_it_is_not_available_yet(): void
    {
        $pending = $this->shipment; // pending agreement

        $this->assertSame('Picking starts once every party has agreed and the run is scheduled.', $this->refusal($pending, Handoff::START_PICKING));
        $this->assertSame('Lines are picked while the run is in picking.', $this->refusal($pending, Handoff::PICK_LINE));
        $this->assertSame('The load can only be prepared while it is being picked.', $this->refusal($pending, Handoff::PREPARED));
        $this->assertSame('The trip starts once the run is scheduled.', $this->refusal($pending, Handoff::COURIER_START));
        $this->assertSame('Start the trip first.', $this->refusal($pending, Handoff::COURIER_CHECK));
        $this->assertSame('Check the load before signing for it.', $this->refusal($pending, Handoff::COURIER_SIGN));
        $this->assertSame('Only a run on the road can arrive.', $this->refusal($pending, Handoff::COURIER_ARRIVE));
        $this->assertSame('Check the goods once the driver has arrived.', $this->refusal($pending, Handoff::RECEIVER_CHECK));
        $this->assertSame('Check the goods before signing them in.', $this->refusal($pending, Handoff::RECEIVER_SIGN));
    }

    #[Test]
    public function the_reasons_follow_where_the_run_has_got_to(): void
    {
        $picking = $this->at(Workflow::PICKING);
        $this->assertSame('Pick every line before marking the load prepared.', $this->refusal($picking, Handoff::PREPARED));

        $started = $this->at(Workflow::SCHEDULED, ['courier_started_at' => now()]);
        $this->assertSame('The trip has already started.', $this->refusal($started, Handoff::COURIER_START));
        $this->assertSame('Wait until the origin has prepared the load.', $this->refusal($started, Handoff::COURIER_CHECK));

        $checked = $this->at(Workflow::READY, ['courier_started_at' => now(), 'courier_checked_at' => now()]);
        $this->assertSame('The load has already been checked.', $this->refusal($checked, Handoff::COURIER_CHECK));
    }

    #[Test]
    public function a_line_not_on_the_manifest_cannot_be_picked_and_ticking_toggles(): void
    {
        $picking = $this->at(Workflow::PICKING);

        $this->assertSame('That line is not on this manifest.', $this->refusal($picking, Handoff::PICK_LINE, ['variant_id' => 999999]));

        $this->handoff->perform($picking, Handoff::PICK_LINE, $this->admin, ['variant_id' => $this->variant->id]);
        $this->assertSame(4, (int) $picking->items()->sole()->picked_quantity, 'ticking picks the whole line');

        $this->handoff->perform($picking->fresh(), Handoff::PICK_LINE, $this->admin, ['variant_id' => $this->variant->id]);
        $this->assertSame(0, (int) $picking->items()->sole()->picked_quantity, 'ticking again puts it back');
    }

    #[Test]
    public function a_signature_must_be_a_real_png_of_sensible_size(): void
    {
        $checked = $this->at(Workflow::READY, ['courier_started_at' => now(), 'courier_checked_at' => now()]);
        $prefix = 'data:image/png;base64,';

        $this->assertSame('A signature is required.', $this->refusal($checked, Handoff::COURIER_SIGN, []));
        $this->assertSame('A signature is required.', $this->refusal($checked, Handoff::COURIER_SIGN, ['signature' => $prefix.'abc']));
        $this->assertSame('That signature is too large.', $this->refusal($checked, Handoff::COURIER_SIGN, ['signature' => $prefix.str_repeat('A', 400_001)]));
        $this->assertSame('That signature could not be read.', $this->refusal($checked, Handoff::COURIER_SIGN, ['signature' => $prefix.str_repeat('!', 300)]));

        $this->assertSame(Workflow::READY, $checked->fresh()->status, 'a refused signature hands nothing over');
    }

    #[Test]
    public function only_the_assigned_driver_or_the_right_dock_may_act(): void
    {
        $courier = User::factory()->create(['role' => 'delivery']);
        $courier->assignRole('delivery');
        $other = User::factory()->create(['role' => 'delivery']);
        $other->assignRole('delivery');
        $scheduled = $this->at(Workflow::SCHEDULED, ['courier_id' => $courier->id]);

        $this->assertSame('Only the driver carrying this run can do that.', $this->refusal($scheduled, Handoff::COURIER_START, [], $other->refresh()));
        $this->assertSame('Only the origin dock picks and prepares this shipment.', $this->refusal($scheduled, Handoff::START_PICKING, [], $courier->refresh()));
        $this->assertSame('Only the receiving dock checks and signs this shipment in.', $this->refusal($scheduled, Handoff::RECEIVER_CHECK, [], $courier));

        $this->assertSame([Handoff::COURIER_START], $this->handoff->stepsFor($scheduled, $courier));
        $this->assertSame([], $this->handoff->stepsFor($scheduled, null));
    }

    #[Test]
    public function the_dock_people_of_a_place_without_staff_are_none(): void
    {
        $this->assertSame([], $this->handoff->dockPeople(null));
    }
}
