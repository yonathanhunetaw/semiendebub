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
 * The seller's manifest builder, against the shared shipments domain.
 *
 * Build and Review used to carry their own demo data: three facilities, three
 * units, four SKUs, four October 2024 windows and a cast of invented drivers
 * and keepers whose agreement was inferred from whichever screen the seller was
 * looking at. Editing any of it changed local React state and nothing else.
 *
 * These tests pin the connection: what the two screens are handed comes from
 * the record, and what the seller does on them reaches the same rows the
 * delivery, stock keeper and admin screens read.
 */
class SellerManifestBuilderTest extends TestCase
{
    use RefreshDatabase;

    private Store $warehouse;

    private Store $store;

    private Store $otherWarehouse;

    private User $seller;

    private User $stockKeeper;

    private User $courier;

    private ItemVariant $variant;

    private ItemVariant $otherVariant;

    private const SLOT = '2026-12-01T08:30';

    private const OTHER_SLOT = '2026-12-02T17:00';

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'stock_keeper', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->warehouse = Store::factory()->create(['name' => 'Central Hub']);
        $this->store = Store::factory()->create(['name' => 'Main Store']);
        $this->otherWarehouse = Store::factory()->create(['name' => 'Bole Depot']);

        $this->seller = $this->userWithRole('seller', $this->store->id);
        $this->stockKeeper = $this->userWithRole('stock_keeper', $this->warehouse->id);
        $this->courier = $this->userWithRole('delivery', null);

        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $this->otherVariant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->setStock($this->warehouse, $this->variant, 100);
        $this->setStock($this->warehouse, $this->otherVariant, 100);
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

    private function asSeller(): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'seller.localhost']);
        $this->actingAs($this->seller, 'web');

        return $this;
    }

    private function setStock(Store $store, ItemVariant $variant, int $quantity): void
    {
        ItemStock::updateOrCreate(
            [
                'item_variant_id' => $variant->id,
                'location_type' => Store::class,
                'location_id' => $store->id,
            ],
            ['quantity' => $quantity, 'min_stock_level' => 0],
        );
    }

    private function workflow(): ShipmentWorkflowService
    {
        return app(ShipmentWorkflowService::class);
    }

    /** An inbound replenishment the seller raised, with one line on it. */
    private function inboundRun(int $quantity = 30, ?int $originId = null): Shipment
    {
        $shipment = $this->workflow()->create(
            $originId ?? $this->warehouse->id,
            $this->store->id,
            ['scheduled_for' => self::SLOT, 'vehicle_max_cbm' => 14.5],
            $this->seller->id,
        );

        $this->workflow()->addItem(
            $shipment->fresh(),
            $this->variant,
            $quantity,
            ['cbm' => 1.8, 'weight_kg' => 480],
        );

        return $shipment->fresh();
    }

    /** Tick the two parties the seller cannot tick for themselves. */
    private function othersAgree(Shipment $shipment, string $slot = self::SLOT): Shipment
    {
        $shipment = $this->workflow()->recordPartyAgreement($shipment->fresh(), 'fleet', $slot, $this->courier);
        $shipment = $this->workflow()->recordPartyAgreement($shipment->fresh(), 'origin', $slot, $this->stockKeeper);

        return $shipment->fresh();
    }

    /* =====================================================================
     | What the screens are handed
     |====================================================================*/

    #[Test]
    public function the_build_screen_is_served_real_stores_variants_and_party_stances(): void
    {
        $shipment = $this->othersAgree($this->inboundRun());

        $response = $this->asSeller()->get(route('seller.shipments.show', $shipment));

        $response->assertOk();
        $props = $response->viewData('page')['props'];

        // Both ends of the Edit Route sheet, from the stores table.
        $labels = array_column($props['stores'], 'label');
        $this->assertCount(3, $props['stores']);
        $this->assertTrue(
            (bool) preg_grep('/Central Hub/', $labels),
            'The origin picker must offer real stores, not three demo slugs.'
        );

        // The Add Items sheet picks from real variants.
        $this->assertNotEmpty($props['variants']);
        $this->assertSame(
            [$this->variant->id, $this->otherVariant->id],
            array_column($props['variants'], 'id'),
        );

        // The gate reflects the ticks the other roles actually recorded.
        $this->assertSame('accepted', $props['agreements']['fleet']['status']);
        $this->assertSame('accepted', $props['agreements']['origin']['status']);
        $this->assertSame(['destination'], $props['outstanding_parties']);
        $this->assertContains('destination', $props['actionable_parties']);

        // And the windows on the table are the ones on the record.
        $this->assertSame([self::SLOT], $props['schedule_options']);
        $this->assertTrue($props['can_edit_manifest']);
    }

    #[Test]
    public function the_review_screen_refuses_to_claim_agreement_that_has_not_happened(): void
    {
        $shipment = $this->inboundRun();

        $props = $this->asSeller()
            ->get(route('seller.shipments.review', $shipment))
            ->viewData('page')['props'];

        $this->assertFalse(
            $props['can_dispatch'],
            'Review must not offer dispatch while the gate is still open.'
        );
        $this->assertSame('pending', $props['agreements']['fleet']['status']);
        $this->assertSame(['fleet', 'origin', 'destination'], $props['outstanding_parties']);
    }

    #[Test]
    public function review_opens_dispatch_once_all_four_parties_align(): void
    {
        $shipment = $this->othersAgree($this->inboundRun());

        $this->asSeller()
            ->post(route('seller.shipments.agree', $shipment), ['slot' => self::SLOT])
            ->assertSessionHasNoErrors();

        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->fresh()->status);

        $props = $this->asSeller()
            ->get(route('seller.shipments.review', $shipment))
            ->viewData('page')['props'];

        $this->assertTrue($props['can_dispatch']);
    }

    /* =====================================================================
     | Editing the manifest
     |====================================================================*/

    #[Test]
    public function the_add_items_sheet_writes_every_selected_line(): void
    {
        $shipment = $this->inboundRun();

        $this->asSeller()
            ->post(route('seller.shipments.items.bulk', $shipment), [
                'lines' => [
                    ['item_variant_id' => $this->otherVariant->id, 'quantity' => 12, 'unit' => 'Box'],
                ],
            ])
            ->assertSessionHasNoErrors();

        $this->assertSame(2, $shipment->fresh()->items()->count());
        $line = $shipment->fresh()->items()->where('item_variant_id', $this->otherVariant->id)->sole();
        $this->assertSame(12, (int) $line->quantity);
        $this->assertSame('Box', $line->unit);
    }

    #[Test]
    public function a_failing_line_leaves_the_whole_selection_unwritten(): void
    {
        $shipment = $this->inboundRun();

        // The second line names a variant that does not exist, so validation
        // rejects the request before any of it is written.
        $this->asSeller()
            ->post(route('seller.shipments.items.bulk', $shipment), [
                'lines' => [
                    ['item_variant_id' => $this->otherVariant->id, 'quantity' => 5],
                    ['item_variant_id' => 999999, 'quantity' => 5],
                ],
            ])
            ->assertSessionHasErrors('lines.1.item_variant_id');

        $this->assertSame(1, $shipment->fresh()->items()->count());
    }

    #[Test]
    public function removing_a_line_removes_it_from_the_record(): void
    {
        $shipment = $this->inboundRun();

        $this->asSeller()
            ->delete(route('seller.shipments.items.destroy', [$shipment, $this->variant]))
            ->assertSessionHasNoErrors();

        $this->assertSame(0, $shipment->fresh()->items()->count());
    }

    #[Test]
    public function a_line_can_be_moved_onto_another_open_run_from_the_same_origin(): void
    {
        $from = $this->inboundRun();
        $to = $this->inboundRun(5);

        $this->asSeller()
            ->post(route('seller.shipments.items.move', [$from, $this->variant]), [
                'target_shipment_id' => $to->id,
            ])
            ->assertSessionHasNoErrors();

        $this->assertSame(0, $from->fresh()->items()->count());
        // The target already carried this SKU, so the quantities merge.
        $this->assertSame(35, (int) $to->fresh()->items()->sole()->quantity);
    }

    #[Test]
    public function a_line_cannot_be_moved_to_a_run_leaving_a_different_origin(): void
    {
        $from = $this->inboundRun();
        $elsewhere = $this->inboundRun(5, $this->otherWarehouse->id);

        $this->asSeller()
            ->post(route('seller.shipments.items.move', [$from, $this->variant]), [
                'target_shipment_id' => $elsewhere->id,
            ])
            ->assertSessionHas('error');

        $this->assertSame(1, $from->fresh()->items()->count());
        $this->assertSame(1, $elsewhere->fresh()->items()->count());
    }

    #[Test]
    public function the_move_sheet_is_only_offered_runs_the_move_would_accept(): void
    {
        $shipment = $this->inboundRun();
        $sameOrigin = $this->inboundRun(5);
        $this->inboundRun(5, $this->otherWarehouse->id);

        $props = $this->asSeller()
            ->get(route('seller.shipments.show', $shipment))
            ->viewData('page')['props'];

        $this->assertSame(
            [$sameOrigin->id],
            array_column($props['move_targets'], 'id'),
            'Only open runs leaving the same dock can take a line.'
        );
    }

    /* =====================================================================
     | Route and schedule changes withdraw consent
     |====================================================================*/

    #[Test]
    public function rerouting_a_run_asks_the_other_three_parties_again(): void
    {
        $shipment = $this->othersAgree($this->inboundRun());

        $this->asSeller()
            ->post(route('seller.shipments.agree', $shipment), ['slot' => self::SLOT])
            ->assertSessionHasNoErrors();

        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->fresh()->status);

        $this->asSeller()
            ->patch(route('seller.shipments.route.update', $shipment), [
                'origin_store_id' => $this->otherWarehouse->id,
                'destination_store_id' => $this->store->id,
            ])
            ->assertSessionHasNoErrors();

        $shipment = $shipment->fresh();

        $this->assertSame($this->otherWarehouse->id, (int) $shipment->origin_store_id);
        $this->assertSame(
            ShipmentWorkflowService::PENDING_AGREEMENT,
            $shipment->status,
            'A rerouted run cannot stay scheduled on consent for the old corridor.'
        );
        $this->assertNull($shipment->agreed_scheduled_for);

        $agreements = $this->workflow()->agreements($shipment);
        $this->assertSame('accepted', $agreements['creator']['status']);
        foreach (['fleet', 'origin', 'destination'] as $party) {
            $this->assertSame('pending', $agreements[$party]['status'], "{$party} must be asked again.");
        }
    }

    #[Test]
    public function a_seller_cannot_reroute_a_run_away_from_their_own_store(): void
    {
        $shipment = $this->inboundRun();

        $this->asSeller()
            ->patch(route('seller.shipments.route.update', $shipment), [
                'origin_store_id' => $this->warehouse->id,
                'destination_store_id' => $this->otherWarehouse->id,
            ])
            ->assertSessionHasErrors('origin_store_id');

        $this->assertSame($this->store->id, (int) $shipment->fresh()->destination_store_id);
    }

    #[Test]
    public function saving_the_manifest_persists_the_slot_the_seller_chose(): void
    {
        $shipment = $this->othersAgree($this->inboundRun());

        $this->asSeller()
            ->post(route('seller.shipments.manifest.save', $shipment), [
                'quantities' => [$this->variant->id => 18],
                'vehicle_name' => 'Isuzu NPR',
                'vehicle_plate' => 'ET-3-9482',
                'vehicle_max_cbm' => 14.5,
                'scheduled_run' => self::OTHER_SLOT,
            ])
            ->assertRedirect(route('seller.shipments.review', $shipment));

        $shipment = $shipment->fresh();

        $this->assertSame(18, (int) $shipment->items()->sole()->quantity);
        $this->assertSame('Isuzu NPR', $shipment->vehicle_name);
        $this->assertSame(
            self::OTHER_SLOT,
            $shipment->scheduled_for?->format('Y-m-d\TH:i'),
            'The slot was validated and then dropped, so editing the time did nothing.'
        );
        // The new window joins the menu the other parties choose from.
        $this->assertContains(self::OTHER_SLOT, $this->workflow()->scheduleOptions($shipment));

        // And their earlier ticks no longer count towards a different time.
        $this->assertSame(
            ['fleet', 'origin', 'destination'],
            $this->workflow()->outstandingParties($shipment),
        );
    }

    #[Test]
    public function the_manifest_is_locked_once_the_floor_starts_picking(): void
    {
        $shipment = $this->othersAgree($this->inboundRun());

        $this->asSeller()
            ->post(route('seller.shipments.agree', $shipment), ['slot' => self::SLOT])
            ->assertSessionHasNoErrors();

        $this->workflow()->transition($shipment->fresh(), ShipmentWorkflowService::PICKING);

        $this->asSeller()
            ->delete(route('seller.shipments.items.destroy', [$shipment, $this->variant]))
            ->assertSessionHas('error');

        $this->assertSame(1, $shipment->fresh()->items()->count());

        $props = $this->asSeller()
            ->get(route('seller.shipments.show', $shipment))
            ->viewData('page')['props'];

        $this->assertFalse($props['can_edit_manifest']);
    }

    /* =====================================================================
     | Scope
     |====================================================================*/

    #[Test]
    public function a_seller_cannot_edit_a_manifest_for_a_run_that_misses_their_store(): void
    {
        $foreign = $this->workflow()->create(
            $this->warehouse->id,
            $this->otherWarehouse->id,
            ['scheduled_for' => self::SLOT],
            $this->stockKeeper->id,
        );

        $this->asSeller()
            ->post(route('seller.shipments.items.bulk', $foreign), [
                'lines' => [['item_variant_id' => $this->variant->id, 'quantity' => 4]],
            ])
            ->assertForbidden();

        $this->assertSame(0, $foreign->fresh()->items()->count());
    }
}
