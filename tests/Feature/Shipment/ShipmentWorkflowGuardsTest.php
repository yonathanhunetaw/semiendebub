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
 * The refusals in ShipmentWorkflowService: a run frozen once picking starts,
 * nonsense quantities and dates, illegal status jumps, and moving lines
 * between runs.
 */
class ShipmentWorkflowGuardsTest extends TestCase
{
    use RefreshDatabase;

    private const SLOT = '2026-11-02T08:30';

    private Workflow $workflow;

    private Store $hub;

    private Store $depot;

    private User $admin;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->workflow = app(Workflow::class);
        $this->hub = Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $this->depot = Store::factory()->create(['name' => 'Kality Depot', 'type' => Store::TYPE_REMOTE_WAREHOUSE]);
        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');
        $this->variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create(['status' => 'active'])->id]);
    }

    private function openRun(array $attributes = ['scheduled_for' => self::SLOT]): Shipment
    {
        $shipment = $this->workflow->create($this->hub->id, $this->depot->id, $attributes, $this->admin->id);
        $this->workflow->addItem($shipment->fresh(), $this->variant, 10, ['cbm' => 1.0]);

        return $shipment->fresh();
    }

    private function locked(): Shipment
    {
        $shipment = $this->openRun();
        $shipment->forceFill(['status' => Workflow::PICKING])->save();

        return $shipment->fresh();
    }

    private function assertRefused(string $message, callable $action): void
    {
        try {
            $action();
        } catch (\RuntimeException|\InvalidArgumentException $e) {
            $this->assertStringContainsString($message, $e->getMessage());

            return;
        }

        $this->fail("Expected a refusal containing \"{$message}\".");
    }

    // ---- Creating ----------------------------------------------------------

    #[Test]
    public function a_run_cannot_start_and_end_at_the_same_place(): void
    {
        $this->assertRefused('must be different places', fn () => $this->workflow->create($this->hub->id, $this->hub->id));
    }

    #[Test]
    public function a_car_picked_at_creation_is_copied_onto_the_run_and_driver_ids_are_cleaned(): void
    {
        $car = Vehicle::factory()->create(['name' => 'Isuzu', 'plate' => 'AA-1', 'max_cbm' => 12]);
        $driver = User::factory()->create(['role' => 'delivery', 'first_name' => 'Kebede', 'last_name' => 'Ali']);

        $shipment = $this->openRun(['scheduled_for' => self::SLOT, 'vehicle_id' => $car->id, 'eligible_courier_ids' => [(string) $driver->id, $driver->id]]);

        $this->assertSame('Isuzu', $shipment->vehicle_name);
        $this->assertSame('AA-1', $shipment->vehicle_plate);
        $this->assertSame([$driver->id], $shipment->eligibleCourierIds());
        $fleet = $this->workflow->presentFleet($shipment);
        $this->assertSame($car->id, $fleet['vehicle_id']);
        $this->assertSame([['id' => $driver->id, 'name' => 'Kebede Ali']], $fleet['eligible_couriers']);

        $open = $this->openRun(['scheduled_for' => self::SLOT, 'eligible_courier_ids' => []]);
        $this->assertSame([], $open->eligibleCourierIds(), 'no drivers picked means open to all');
    }

    // ---- The manifest freezes once picking starts --------------------------

    #[Test]
    public function a_quantity_below_one_is_refused(): void
    {
        $this->assertRefused('at least one', fn () => $this->workflow->addItem($this->openRun(), $this->variant, 0));
    }

    #[Test]
    public function the_manifest_fleet_route_and_schedule_are_frozen_once_picking_starts(): void
    {
        $shipment = $this->locked();

        $this->assertRefused('locked once picking', fn () => $this->workflow->addItem($shipment, $this->variant, 1));
        $this->assertRefused('locked once picking', fn () => $this->workflow->addItems($shipment, [['item_variant_id' => $this->variant->id, 'quantity' => 1]]));
        $this->assertRefused('locked once picking', fn () => $this->workflow->syncManifestQuantities($shipment, [$this->variant->id => 3]));
        $this->assertRefused('fleet is fixed', fn () => $this->workflow->assignFleet($shipment, null, []));
        $this->assertRefused('route is fixed', fn () => $this->workflow->reroute($shipment, null, null));
        $this->assertRefused('schedule is fixed', fn () => $this->workflow->reschedule($shipment, '2026-11-03T09:00'));

        $this->assertSame(10, (int) $shipment->items()->sole()->quantity);
    }

    #[Test]
    public function syncing_quantities_ignores_lines_not_mentioned_and_drops_zeroed_ones(): void
    {
        $shipment = $this->openRun();
        $other = ItemVariant::factory()->create(['item_id' => $this->variant->item_id]);
        $this->workflow->addItem($shipment, $other, 4);

        $changed = $this->workflow->syncManifestQuantities($shipment->fresh(), [(string) $other->id => 0]);

        $this->assertSame(1, $changed);
        $this->assertSame([$this->variant->id], $shipment->fresh()->items->pluck('item_variant_id')->map(fn ($id) => (int) $id)->all());
    }

    // ---- Rescheduling and rerouting ----------------------------------------

    #[Test]
    public function a_reschedule_needs_a_real_date_and_the_same_slot_changes_nothing(): void
    {
        $shipment = $this->openRun();

        $this->assertRefused('not a usable date', fn () => $this->workflow->reschedule($shipment, 'next tuesday-ish'));

        $same = $this->workflow->reschedule($shipment, self::SLOT);
        $this->assertSame($shipment->updated_at?->toIso8601String(), $same->updated_at?->toIso8601String());
    }

    #[Test]
    public function rerouting_to_the_same_ends_changes_nothing(): void
    {
        $shipment = $this->openRun();

        $same = $this->workflow->reroute($shipment, $this->hub->id, $this->depot->id);

        $this->assertSame((int) $shipment->origin_stock_location_id, (int) $same->origin_stock_location_id);
        $this->assertSame((int) $shipment->destination_stock_location_id, (int) $same->destination_stock_location_id);
    }

    // ---- Moving a line between runs ----------------------------------------

    #[Test]
    public function a_line_cannot_move_onto_its_own_run_a_frozen_run_or_from_a_run_without_it(): void
    {
        $from = $this->openRun();
        $to = $this->openRun();

        $this->assertRefused('onto its own manifest', fn () => $this->workflow->moveItemTo($from, $from, $this->variant));

        $stranger = ItemVariant::factory()->create(['item_id' => $this->variant->item_id]);
        $this->assertRefused('not on this manifest', fn () => $this->workflow->moveItemTo($from, $to, $stranger));

        $frozen = $this->locked();
        $this->assertRefused("Manifest {$frozen->reference} is locked", fn () => $this->workflow->moveItemTo($from, $frozen, $this->variant));
    }

    // ---- Status moves --------------------------------------------------------

    #[Test]
    public function an_illegal_status_jump_is_refused(): void
    {
        $this->assertRefused('cannot move from pending_agreement to received', fn () => $this->workflow->transition($this->openRun(), Workflow::RECEIVED));
    }

    #[Test]
    public function an_empty_manifest_cannot_be_scheduled(): void
    {
        $shipment = $this->workflow->create($this->hub->id, $this->depot->id, ['scheduled_for' => self::SLOT], $this->admin->id);

        $this->assertRefused('empty manifest', fn () => $this->workflow->transition($shipment, Workflow::SCHEDULED));
    }

    #[Test]
    public function scheduling_without_every_party_agreeing_names_who_is_missing(): void
    {
        $this->assertRefused('Still awaiting agreement from', fn () => $this->workflow->transition($this->openRun(), Workflow::SCHEDULED));
    }

    #[Test]
    public function a_run_changed_by_someone_else_meanwhile_is_refused(): void
    {
        $shipment = $this->openRun();
        Shipment::query()->whereKey($shipment->id)->update(['status' => Workflow::CANCELLED]);

        $this->assertRefused('changed while you were working on it', fn () => $this->workflow->transition($shipment, Workflow::CANCELLED));
    }

    #[Test]
    public function advancing_backwards_is_refused_and_a_cancel_goes_through_transition(): void
    {
        $shipment = $this->openRun();

        $this->assertRefused('already pending_agreement', fn () => $this->workflow->advanceTo($shipment, Workflow::DRAFT));

        $this->assertSame(Workflow::CANCELLED, $this->workflow->advanceTo($shipment, Workflow::CANCELLED)->status);
    }

    #[Test]
    public function only_a_scheduled_or_picking_run_can_be_picked_and_picks_are_capped_at_the_manifest(): void
    {
        $this->assertRefused('Only a scheduled shipment', fn () => $this->workflow->recordPick($this->openRun(), [$this->variant->id => 1]));

        $shipment = $this->locked();
        $other = ItemVariant::factory()->create(['item_id' => $this->variant->item_id]);
        Shipment::query()->whereKey($shipment->id)->update(['status' => Workflow::DRAFT]);
        $this->workflow->addItem($shipment->fresh(), $other, 2);
        Shipment::query()->whereKey($shipment->id)->update(['status' => Workflow::PICKING]);

        $picked = $this->workflow->recordPick($shipment->fresh(), [$this->variant->id => 99]);

        $this->assertSame(Workflow::PICKING, $picked->status);
        $lines = $picked->items->keyBy('item_variant_id');
        $this->assertSame(10, (int) $lines[$this->variant->id]->picked_quantity, 'never more than the manifest asked for');
        $this->assertSame(0, (int) $lines[$other->id]->picked_quantity, 'a line not mentioned is left alone');
    }

    // ---- Agreement ---------------------------------------------------------

    #[Test]
    public function an_unknown_party_cannot_agree(): void
    {
        $this->assertRefused('Unknown shipment party', fn () => $this->workflow->recordPartyAgreement($this->openRun(), 'janitor', self::SLOT));
    }
}
