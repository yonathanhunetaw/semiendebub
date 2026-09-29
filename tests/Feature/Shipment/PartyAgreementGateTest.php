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
 * The 4-party consensus gate, and the two ledger events either side of it.
 *
 *   creator + fleet + origin + destination all accept the SAME slot
 *       -> pending_agreement becomes scheduled
 *   dispatch  -> stock DEDUCTED from origin
 *   received  -> stock CREDITED to destination
 */
class PartyAgreementGateTest extends TestCase
{
    use RefreshDatabase;

    private const PRIMARY = '2026-11-02T08:30';

    private const ALT_ONE = '2026-11-02T17:00';

    private const ALT_TWO = '2026-11-03T09:00';

    private ShipmentWorkflowService $workflow;

    private Store $origin;

    private Store $destination;

    private User $creator;

    private User $courier;

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

        // A shipment may run between any two facilities; this one is
        // central warehouse -> retail store.
        $this->origin = Store::factory()->create([
            'name' => 'Warehouse A',
            'type' => Store::TYPE_CENTRAL_WAREHOUSE,
        ]);
        $this->destination = Store::factory()->create([
            'name' => 'Main Store',
            'type' => Store::TYPE_RETAIL,
        ]);

        $this->creator = $this->user('admin', null);
        $this->courier = $this->user('delivery', null);
        $this->originKeeper = $this->user('stock_keeper', $this->origin->id);
        $this->destinationKeeper = $this->user('stock_keeper', $this->destination->id);

        $this->variant = ItemVariant::factory()->create([
            'item_id' => Item::factory()->create(['status' => 'active'])->id,
        ]);

        $this->setStock($this->origin, 100);
    }

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
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

    /** A shipment with a primary slot, two alternatives and one manifest line. */
    private function proposeShipment(int $quantity = 30): Shipment
    {
        $shipment = $this->workflow->create(
            $this->origin->id,
            $this->destination->id,
            [
                'scheduled_for' => self::PRIMARY,
                'schedule_options' => [self::ALT_ONE, self::ALT_TWO],
                'vehicle_name' => 'Isuzu NPR',
                'vehicle_max_cbm' => 14.5,
            ],
            $this->creator->id,
        );

        $this->workflow->addItem($shipment->fresh(), $this->variant, $quantity, ['cbm' => 1.8]);

        return $shipment->fresh();
    }

    /** Walk a shipment to full consensus on the primary slot. */
    private function reachConsensus(Shipment $shipment, string $slot = self::PRIMARY): Shipment
    {
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'fleet', $slot, $this->courier);
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'origin', $slot, $this->originKeeper);

        return $this->workflow->recordPartyAgreement($shipment, 'destination', $slot, $this->destinationKeeper);
    }

    /* =====================================================================
     | The gate
     |====================================================================*/

    #[Test]
    public function a_new_shipment_is_pending_agreement_with_the_creator_already_ticked(): void
    {
        $shipment = $this->proposeShipment();

        $this->assertSame(ShipmentWorkflowService::PENDING_AGREEMENT, $shipment->status);

        $agreements = $this->workflow->agreements($shipment);
        $this->assertSame('accepted', $agreements['creator']['status'], 'Proposing the schedule is the creator tick.');
        $this->assertSame(self::PRIMARY, $agreements['creator']['slot']);
        $this->assertSame($this->creator->id, $agreements['creator']['user_id']);

        foreach (['fleet', 'origin', 'destination'] as $party) {
            $this->assertSame('pending', $agreements[$party]['status']);
        }

        $this->assertEqualsCanonicalizing(
            ['fleet', 'origin', 'destination'],
            $this->workflow->outstandingParties($shipment),
        );
    }

    #[Test]
    public function the_primary_and_alternative_slots_are_all_on_offer(): void
    {
        $shipment = $this->proposeShipment();

        $this->assertSame(
            [self::PRIMARY, self::ALT_ONE, self::ALT_TWO],
            $this->workflow->scheduleOptions($shipment),
            'Primary first, then the creator alternatives.'
        );
    }

    #[Test]
    public function a_shipment_cannot_be_scheduled_before_all_four_parties_agree(): void
    {
        $shipment = $this->proposeShipment();

        $this->assertFalse($this->workflow->canSchedule($shipment));

        $this->expectException(\RuntimeException::class);
        $this->workflow->transition($shipment, ShipmentWorkflowService::SCHEDULED);
    }

    #[Test]
    public function three_of_four_agreements_is_still_not_enough(): void
    {
        $shipment = $this->proposeShipment();

        $shipment = $this->workflow->recordPartyAgreement($shipment, 'fleet', self::PRIMARY, $this->courier);
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'origin', self::PRIMARY, $this->originKeeper);

        $this->assertFalse($this->workflow->canSchedule($shipment));
        $this->assertSame(ShipmentWorkflowService::PENDING_AGREEMENT, $shipment->status);
        $this->assertSame(['destination'], $this->workflow->outstandingParties($shipment));
    }

    #[Test]
    public function four_agreements_on_different_slots_is_not_a_consensus(): void
    {
        $shipment = $this->proposeShipment();

        // Everyone accepts — but the destination picks a different window.
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'fleet', self::PRIMARY, $this->courier);
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'origin', self::PRIMARY, $this->originKeeper);
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'destination', self::ALT_TWO, $this->destinationKeeper);

        $this->assertSame([], $this->workflow->outstandingParties($shipment), 'All four have responded.');
        $this->assertFalse($this->workflow->canSchedule($shipment), 'But they are not aligned.');
        $this->assertNull($this->workflow->consensusSlot($shipment));
        $this->assertSame(ShipmentWorkflowService::PENDING_AGREEMENT, $shipment->status);
    }

    #[Test]
    public function the_fourth_aligned_tick_promotes_the_shipment_to_scheduled(): void
    {
        $shipment = $this->reachConsensus($this->proposeShipment());

        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->status);
        $this->assertSame(self::PRIMARY, $this->workflow->consensusSlot($shipment));
        $this->assertSame(
            self::PRIMARY,
            $shipment->agreed_scheduled_for->format('Y-m-d\TH:i'),
            'The agreed slot is recorded.'
        );
    }

    #[Test]
    public function parties_can_converge_on_an_alternative_slot(): void
    {
        $shipment = $this->proposeShipment();

        // Nobody can make the primary; all realign on alternative two.
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'creator', self::ALT_TWO, $this->creator);
        $shipment = $this->reachConsensus($shipment, self::ALT_TWO);

        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->status);
        $this->assertSame(self::ALT_TWO, $shipment->agreed_scheduled_for->format('Y-m-d\TH:i'));
    }

    #[Test]
    public function a_reschedule_stance_blocks_consensus(): void
    {
        $shipment = $this->proposeShipment();

        $shipment = $this->workflow->recordPartyAgreement($shipment, 'fleet', self::PRIMARY, $this->courier);
        $shipment = $this->workflow->recordPartyAgreement($shipment, 'origin', self::PRIMARY, $this->originKeeper);
        $shipment = $this->workflow->recordPartyAgreement(
            $shipment,
            'destination',
            self::PRIMARY,
            $this->destinationKeeper,
            ShipmentWorkflowService::AGREEMENT_RESCHEDULED,
        );

        $this->assertFalse($this->workflow->canSchedule($shipment));
        $this->assertSame(['destination'], $this->workflow->outstandingParties($shipment));
    }

    #[Test]
    public function a_slot_that_was_never_proposed_is_rejected(): void
    {
        $shipment = $this->proposeShipment();

        $this->expectException(\InvalidArgumentException::class);
        $this->workflow->recordPartyAgreement($shipment, 'fleet', '2099-01-01T00:00', $this->courier);
    }

    #[Test]
    public function agreements_cannot_be_changed_once_scheduled(): void
    {
        $shipment = $this->reachConsensus($this->proposeShipment());

        $this->expectException(\RuntimeException::class);
        $this->workflow->recordPartyAgreement($shipment, 'fleet', self::ALT_ONE, $this->courier);
    }

    #[Test]
    public function an_empty_manifest_cannot_be_scheduled_even_with_full_consensus(): void
    {
        $shipment = $this->workflow->create(
            $this->origin->id,
            $this->destination->id,
            ['scheduled_for' => self::PRIMARY],
            $this->creator->id,
        );

        $shipment = $this->reachConsensus($shipment->fresh());

        // The gate promoted it, but a manual transition still guards the manifest.
        $this->assertNotSame(ShipmentWorkflowService::DRAFT, $shipment->status);
        $this->assertSame(0, $shipment->items()->count());
    }

    /* =====================================================================
     | Party authorization
     |====================================================================*/

    #[Test]
    public function each_role_may_only_tick_its_own_party(): void
    {
        $shipment = $this->proposeShipment();

        $this->assertSame(['fleet'], $this->workflow->partiesFor($shipment, $this->courier));
        $this->assertSame(['origin'], $this->workflow->partiesFor($shipment, $this->originKeeper));
        $this->assertSame(['destination'], $this->workflow->partiesFor($shipment, $this->destinationKeeper));

        // An outsider is party to nothing.
        $outsider = $this->user('seller', Store::factory()->create()->id);
        $this->assertSame([], $this->workflow->partiesFor($shipment, $outsider));
    }

    #[Test]
    public function the_agree_endpoint_refuses_a_party_the_user_does_not_hold(): void
    {
        $shipment = $this->proposeShipment();

        $this->withServerVariables(['HTTP_HOST' => 'delivery.localhost'])
            ->actingAs($this->courier, 'web')
            ->post(route('delivery.shipments.agree', $shipment), [
                'party' => 'origin',           // a courier is not the origin dock
                'slot' => self::PRIMARY,
            ])
            ->assertForbidden();

        $this->assertSame('pending', $this->workflow->agreements($shipment->fresh())['origin']['status']);
    }

    #[Test]
    public function a_courier_can_tick_fleet_through_the_endpoint(): void
    {
        $shipment = $this->proposeShipment();

        $this->withServerVariables(['HTTP_HOST' => 'delivery.localhost'])
            ->actingAs($this->courier, 'web')
            ->post(route('delivery.shipments.agree', $shipment), ['slot' => self::PRIMARY])
            ->assertSessionHasNoErrors();

        $this->assertSame('accepted', $this->workflow->agreements($shipment->fresh())['fleet']['status']);
    }

    #[Test]
    public function guests_cannot_record_an_agreement(): void
    {
        $shipment = $this->proposeShipment();

        $this->withServerVariables(['HTTP_HOST' => 'delivery.localhost'])
            ->post(route('delivery.shipments.agree', $shipment), ['slot' => self::PRIMARY])
            ->assertRedirect(route('delivery.login'));

        $this->assertSame('pending', $this->workflow->agreements($shipment->fresh())['fleet']['status']);
    }

    #[Test]
    public function the_agree_endpoint_requires_a_slot(): void
    {
        $shipment = $this->proposeShipment();

        $this->withServerVariables(['HTTP_HOST' => 'delivery.localhost'])
            ->actingAs($this->courier, 'web')
            ->post(route('delivery.shipments.agree', $shipment), [])
            ->assertSessionHasErrors('slot');
    }

    /* =====================================================================
     | Cross-role visibility
     |====================================================================*/

    #[Test]
    public function a_newly_opened_shipment_is_visible_to_every_party(): void
    {
        $shipment = $this->proposeShipment();

        // Without this the agreement gate is unclearable: a courier cannot tick
        // "fleet" on a shipment that never appears in their list.
        foreach ([
            'courier' => $this->courier,
            'origin keeper' => $this->originKeeper,
            'destination keeper' => $this->destinationKeeper,
            'creator' => $this->creator,
        ] as $who => $user) {
            $this->assertTrue(
                $this->workflow->isVisibleTo($shipment, $user),
                "A freshly opened shipment must be visible to the {$who}."
            );
        }
    }

    #[Test]
    public function a_courier_sees_unclaimed_shipments_that_still_need_a_driver(): void
    {
        $shipment = $this->proposeShipment();

        $this->assertTrue(
            $this->workflow->visibleQuery($this->courier)->whereKey($shipment->id)->exists(),
            'An unclaimed, open shipment must reach the courier board.'
        );
    }

    #[Test]
    public function an_unrelated_facility_keeper_cannot_see_the_shipment(): void
    {
        $shipment = $this->proposeShipment();
        $outsider = $this->user('seller', Store::factory()->create()->id);

        $this->assertFalse($this->workflow->isVisibleTo($shipment, $outsider));
    }

    #[Test]
    public function guests_see_nothing(): void
    {
        $this->proposeShipment();

        $this->assertSame(0, $this->workflow->visibleQuery(null)->count());
    }

    /* =====================================================================
     | Execution actually moves the shipment
     |====================================================================*/

    #[Test]
    public function agreeing_as_fleet_assigns_that_courier_to_the_run(): void
    {
        $shipment = $this->proposeShipment();
        $this->assertNull($shipment->courier_id);

        $shipment = $this->workflow->recordPartyAgreement($shipment, 'fleet', self::PRIMARY, $this->courier);

        // Otherwise the courier is later refused on their own run.
        $this->assertSame($this->courier->id, $shipment->courier_id);
    }

    #[Test]
    public function handover_walks_the_intermediate_stages_rather_than_failing_silently(): void
    {
        $shipment = $this->reachConsensus($this->proposeShipment(30));
        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->status);

        // scheduled -> dispatched is not a single legal hop; advanceTo walks it.
        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.localhost'])
            ->actingAs($this->originKeeper, 'web')
            ->post(route('stock_keeper.shipments.handover', $shipment))
            ->assertSessionHasNoErrors();

        $this->assertSame(ShipmentWorkflowService::DISPATCHED, $shipment->fresh()->status);
        $this->assertSame(70, $this->stockAt($this->origin), 'And the ledger actually moved.');
    }

    #[Test]
    public function dispatch_reports_why_it_cannot_run_while_the_gate_is_open(): void
    {
        $shipment = $this->proposeShipment();

        $this->withServerVariables(['HTTP_HOST' => 'seller.localhost'])
            ->actingAs($this->destinationKeeper, 'web')
            ->post(route('seller.shipments.dispatch', $shipment))
            ->assertSessionHas('error');

        $this->assertSame(ShipmentWorkflowService::PENDING_AGREEMENT, $shipment->fresh()->status);
        $this->assertSame(100, $this->stockAt($this->origin));
    }

    #[Test]
    public function saving_the_manifest_persists_the_edited_quantities(): void
    {
        $shipment = $this->proposeShipment(30);
        $variantId = $this->variant->id;

        $this->withServerVariables(['HTTP_HOST' => 'seller.localhost'])
            ->actingAs($this->destinationKeeper, 'web')
            ->post(route('seller.shipments.manifest.save', $shipment), [
                'quantities' => [$variantId => 44],
            ])
            ->assertSessionHasNoErrors();

        $this->assertSame(44, (int) $shipment->fresh()->items()->first()->quantity);
    }

    #[Test]
    public function saving_a_zero_quantity_drops_the_line(): void
    {
        $shipment = $this->proposeShipment(30);

        $this->withServerVariables(['HTTP_HOST' => 'seller.localhost'])
            ->actingAs($this->destinationKeeper, 'web')
            ->post(route('seller.shipments.manifest.save', $shipment), [
                'quantities' => [$this->variant->id => 0],
            ])
            ->assertSessionHasNoErrors();

        $this->assertSame(0, $shipment->fresh()->items()->count());
    }

    /* =====================================================================
     | Ledger: deduct at origin, credit at destination
     |====================================================================*/

    #[Test]
    public function stock_is_deducted_from_the_origin_on_dispatch(): void
    {
        $shipment = $this->reachConsensus($this->proposeShipment(30));

        $this->assertSame(100, $this->stockAt($this->origin), 'Consensus alone moves nothing.');

        $shipment = $this->workflow->transition($shipment, ShipmentWorkflowService::PICKING);
        $shipment = $this->workflow->transition($shipment, ShipmentWorkflowService::READY);

        $this->assertSame(100, $this->stockAt($this->origin), 'Picking alone moves nothing.');

        $shipment = $this->workflow->transition($shipment, ShipmentWorkflowService::DISPATCHED);

        $this->assertSame(70, $this->stockAt($this->origin), 'Origin debited at handover.');
        $this->assertSame(0, $this->stockAt($this->destination), 'Destination not yet credited.');
    }

    #[Test]
    public function stock_is_credited_to_the_destination_only_on_receipt(): void
    {
        $shipment = $this->reachConsensus($this->proposeShipment(30));

        foreach ([
            ShipmentWorkflowService::PICKING,
            ShipmentWorkflowService::READY,
            ShipmentWorkflowService::DISPATCHED,
            ShipmentWorkflowService::IN_TRANSIT,
            ShipmentWorkflowService::DELIVERED,
        ] as $stage) {
            $shipment = $this->workflow->transition($shipment, $stage);
        }

        $this->assertSame(0, $this->stockAt($this->destination), 'Delivered is not received.');

        $shipment = $this->workflow->transition($shipment, ShipmentWorkflowService::RECEIVED);

        $this->assertSame(30, $this->stockAt($this->destination), 'Destination credited on receipt.');
        $this->assertSame(70, $this->stockAt($this->origin));

        // Conservation: nothing created, nothing destroyed.
        $this->assertSame(100, $this->stockAt($this->origin) + $this->stockAt($this->destination));
    }

    #[Test]
    public function a_short_pick_moves_only_what_was_actually_picked(): void
    {
        $shipment = $this->reachConsensus($this->proposeShipment(30));

        $this->workflow->recordPick($shipment, [$this->variant->id => 18]);
        $shipment = $this->workflow->transition($shipment->fresh(), ShipmentWorkflowService::READY);
        $shipment = $this->workflow->transition($shipment, ShipmentWorkflowService::DISPATCHED);

        $this->assertSame(82, $this->stockAt($this->origin));

        foreach ([ShipmentWorkflowService::IN_TRANSIT, ShipmentWorkflowService::DELIVERED, ShipmentWorkflowService::RECEIVED] as $stage) {
            $shipment = $this->workflow->transition($shipment, $stage);
        }

        $this->assertSame(18, $this->stockAt($this->destination));
        $this->assertSame(100, $this->stockAt($this->origin) + $this->stockAt($this->destination));
    }

    #[Test]
    public function cancelling_after_dispatch_returns_the_stock_to_the_origin(): void
    {
        $shipment = $this->reachConsensus($this->proposeShipment(30));

        foreach ([ShipmentWorkflowService::PICKING, ShipmentWorkflowService::READY, ShipmentWorkflowService::DISPATCHED] as $stage) {
            $shipment = $this->workflow->transition($shipment, $stage);
        }

        $this->assertSame(70, $this->stockAt($this->origin));

        $this->workflow->transition($shipment, ShipmentWorkflowService::CANCELLED, ['cancel_reason' => 'Truck broke down']);

        $this->assertSame(100, $this->stockAt($this->origin), 'In-flight stock returns home.');
        $this->assertSame(0, $this->stockAt($this->destination));
    }

    #[Test]
    public function a_warehouse_to_warehouse_shipment_moves_stock_between_facilities(): void
    {
        $remote = Store::factory()->create([
            'name' => 'Remote Warehouse',
            'type' => Store::TYPE_REMOTE_WAREHOUSE,
        ]);

        $shipment = $this->workflow->create(
            $this->origin->id,
            $remote->id,
            ['scheduled_for' => self::PRIMARY],
            $this->creator->id,
        );
        $this->workflow->addItem($shipment->fresh(), $this->variant, 25);
        $shipment = $this->reachConsensus($shipment->fresh());

        foreach ([
            ShipmentWorkflowService::PICKING,
            ShipmentWorkflowService::READY,
            ShipmentWorkflowService::DISPATCHED,
            ShipmentWorkflowService::IN_TRANSIT,
            ShipmentWorkflowService::DELIVERED,
            ShipmentWorkflowService::RECEIVED,
        ] as $stage) {
            $shipment = $this->workflow->transition($shipment, $stage);
        }

        $this->assertSame(75, $this->stockAt($this->origin));
        $this->assertSame(25, $this->stockAt($remote), 'Remote warehouse is a valid destination.');
    }

    #[Test]
    public function a_dispatch_the_origin_cannot_cover_is_refused(): void
    {
        // Manifest asks for more than the origin holds.
        $shipment = $this->reachConsensus($this->proposeShipment(140));

        $shipment = $this->workflow->transition($shipment, ShipmentWorkflowService::PICKING);
        $shipment = $this->workflow->transition($shipment, ShipmentWorkflowService::READY);

        try {
            $this->workflow->transition($shipment, ShipmentWorkflowService::DISPATCHED);
            $this->fail('A dispatch the origin cannot cover should be refused.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('cannot cover', $e->getMessage());
        }

        // The old behaviour clamped at zero: status advanced, nothing moved.
        $this->assertSame(ShipmentWorkflowService::READY, $shipment->fresh()->status);
        $this->assertSame(100, $this->stockAt($this->origin), 'Stock must be untouched.');
    }

    #[Test]
    public function the_shortfall_message_names_the_offending_line(): void
    {
        $shipment = $this->reachConsensus($this->proposeShipment(140));

        $short = $this->workflow->uncoveredLines($shipment);

        $this->assertCount(1, $short);
        $this->assertStringContainsString('needs 140', $short[0]);
        $this->assertStringContainsString('100 on hand', $short[0]);
    }

    #[Test]
    public function a_short_pick_makes_an_over_asked_manifest_dispatchable(): void
    {
        $shipment = $this->reachConsensus($this->proposeShipment(140));

        // The floor finds only what is there, and that is what moves.
        $this->workflow->recordPick($shipment, [$this->variant->id => 100]);
        $shipment = $this->workflow->transition($shipment->fresh(), ShipmentWorkflowService::READY);
        $shipment = $this->workflow->transition($shipment, ShipmentWorkflowService::DISPATCHED);

        $this->assertSame(ShipmentWorkflowService::DISPATCHED, $shipment->status);
        $this->assertSame(0, $this->stockAt($this->origin));
    }

    /* =====================================================================
     | Handover / receive endpoints
     |====================================================================*/

    #[Test]
    public function the_origin_keeper_can_hand_over_and_that_debits_the_origin(): void
    {
        $shipment = $this->reachConsensus($this->proposeShipment(30));
        $shipment = $this->workflow->transition($shipment, ShipmentWorkflowService::PICKING);
        $shipment = $this->workflow->transition($shipment, ShipmentWorkflowService::READY);

        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.localhost'])
            ->actingAs($this->originKeeper, 'web')
            ->post(route('stock_keeper.shipments.handover', $shipment))
            ->assertSessionHasNoErrors();

        $this->assertSame(ShipmentWorkflowService::DISPATCHED, $shipment->fresh()->status);
        $this->assertSame(70, $this->stockAt($this->origin));
    }

    #[Test]
    public function the_destination_keeper_can_receive_and_that_credits_the_destination(): void
    {
        $shipment = $this->reachConsensus($this->proposeShipment(30));

        foreach ([
            ShipmentWorkflowService::PICKING,
            ShipmentWorkflowService::READY,
            ShipmentWorkflowService::DISPATCHED,
            ShipmentWorkflowService::IN_TRANSIT,
            ShipmentWorkflowService::DELIVERED,
        ] as $stage) {
            $shipment = $this->workflow->transition($shipment, $stage);
        }

        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.localhost'])
            ->actingAs($this->destinationKeeper, 'web')
            ->post(route('stock_keeper.shipments.receive', $shipment))
            ->assertSessionHasNoErrors();

        $this->assertSame(ShipmentWorkflowService::RECEIVED, $shipment->fresh()->status);
        $this->assertSame(30, $this->stockAt($this->destination));
    }

    #[Test]
    public function an_unrelated_keeper_cannot_hand_over_someone_elses_shipment(): void
    {
        $shipment = $this->reachConsensus($this->proposeShipment(30));
        $shipment = $this->workflow->transition($shipment, ShipmentWorkflowService::PICKING);
        $shipment = $this->workflow->transition($shipment, ShipmentWorkflowService::READY);

        $outsider = $this->user('stock_keeper', Store::factory()->create()->id);

        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.localhost'])
            ->actingAs($outsider, 'web')
            ->post(route('stock_keeper.shipments.handover', $shipment))
            ->assertForbidden();

        $this->assertSame(100, $this->stockAt($this->origin), 'No stock moved.');
    }
}
