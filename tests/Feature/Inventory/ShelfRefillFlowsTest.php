<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\FacilityManager;
use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Services\Inventory\RefillEngine;
use App\Services\Inventory\StockLocationTree;
use App\Services\ShipmentWorkflowService;
use App\Services\StockService;
use App\Services\TransferWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The refill waiting list end to end: a bin dropping to its refill line raises
 * a refill on its own; the floor's part goes straight to the shelving list; the
 * store manager rules on the Remote Hub and shipment parts; the Remote Hub
 * accepts and a courier carries it; what lands on the floor is shelved.
 *
 * One item sold by the piece. The bin: max 50, refill at 20, crit low at 10.
 */
class ShelfRefillFlowsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $shelf;

    private StockLocation $floor;

    private StockLocation $remote;

    private StockLocation $hubA;

    private Item $item;

    private ItemVariant $variant;

    private StockService $stock;

    private User $manager;

    private User $keeper;

    private User $courier;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->stock = app(StockService::class);
        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $this->floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        $this->remote = app(StockLocationTree::class)->addRemoteHub($this->store);
        $warehouse = Warehouse::create(['name' => 'Main Distribution Hub A', 'code' => 'WH-MAIN-01']);
        $this->hubA = StockLocation::query()->legacy(Warehouse::class, $warehouse->id)->sole();

        $this->item = Item::factory()->create(['product_name' => 'Bic Pen', 'status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $this->item->id]);
        ShelfItemBand::query()->create([
            'stock_location_id' => $this->shelf->id,
            'item_id' => $this->item->id,
            'max_units' => 50,
            'refill_units' => 20,
            'critical_units' => 10,
        ]);

        $this->manager = $this->user('store_manager');
        $this->keeper = $this->user('stock_keeper');
        $this->courier = $this->user('delivery', null);
    }

    #[Test]
    public function a_bin_dropping_to_its_refill_line_raises_a_refill_on_its_own(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 10);
        $this->stock->receive($this->variant->id, $this->remote, 100);
        $this->stock->receive($this->variant->id, $this->shelf, 30);
        $this->assertSame(0, RefillRequest::query()->count(), 'Above the refill line nothing is raised.');

        // Fifteen sell: 15 left, 35 short. The floor gives its 10; 25 from the Remote Hub.
        $this->stock->adjust($this->variant->id, $this->shelf, -15);

        $this->assertSame(10, $this->leg(ItemRefillRoute::SOURCE_FLOOR)->quantity);
        $this->assertSame(10, (int) Transfer::query()->sole()->quantity);
        $remote = $this->leg(ItemRefillRoute::SOURCE_REMOTE_HUB);
        $this->assertSame([RefillRequest::STATUS_PENDING, 25, RefillRequest::ORIGIN_AUTO], [$remote->status, $remote->quantity, $remote->origin]);
    }

    #[Test]
    public function a_suggestion_put_on_the_remote_list_is_accepted_carried_and_shelved(): void
    {
        $this->stock->receive($this->variant->id, $this->remote, 100);
        $this->stock->receive($this->variant->id, $this->shelf, 30);
        $this->stock->adjust($this->variant->id, $this->shelf, -30);   // empty: 50 short, all from the hub

        $leg = $this->leg(ItemRefillRoute::SOURCE_REMOTE_HUB);
        $this->assertSame([RefillRequest::STATUS_PENDING, 50, 50], [$leg->status, $leg->quantity, $leg->requested_quantity]);

        // The manager puts 40 on the Remote Hub list: that is the approval.
        $this->as($this->manager, 'seller')
            ->post(route('seller.refills.remote', $leg), ['quantity' => 40])
            ->assertSessionHas('success');
        $leg->refresh();
        $this->assertSame([RefillRequest::STATUS_IN_PROGRESS, 40, 50, true], [$leg->status, $leg->quantity, $leg->requested_quantity, $leg->awaitsHub()]);
        $this->assertTrue($leg->wasAdjusted());

        // The hub's stock keeper accepts: a Remote Hub → floor transfer for a courier.
        $this->as($this->keeper, 'stockkeeper')
            ->post(route('stock_keeper.refills.accept', $leg))
            ->assertSessionHas('success');
        $leg->refresh();
        $transfer = $leg->transfer;
        $this->assertFalse($leg->awaitsHub());
        $this->assertSame([$this->remote->id, $this->floor->id, 40], [(int) $transfer->source_location_id, (int) $transfer->destination_location_id, (int) $transfer->quantity]);
        $workflow = app(TransferWorkflowService::class);
        $this->assertTrue($workflow->needsCourier($transfer));

        $workflow->assignCourier($transfer, $this->courier);
        $workflow->markDispatched($transfer->fresh());
        $workflow->markCompleted($transfer->fresh(), $this->courier);

        // Landed on the floor: the leg is done, and the 40 go onto the shelving list.
        $this->assertSame(RefillRequest::STATUS_FULFILLED, $leg->fresh()->status);
        $shelving = Transfer::query()->where('destination_location_id', $this->shelf->id)->sole();
        $this->assertSame([$this->floor->id, 40], [(int) $shelving->source_location_id, (int) $shelving->quantity]);
        $floorLeg = $this->leg(ItemRefillRoute::SOURCE_FLOOR);

        $workflow->markDispatched($shelving, $this->keeper);
        $workflow->markCompleted($shelving->fresh(), $this->keeper);

        $this->assertSame(RefillRequest::STATUS_FULFILLED, $floorLeg->fresh()->status);
        $this->assertSame(40, $this->onShelf());
    }

    #[Test]
    public function only_a_store_manager_with_the_tick_acts_on_a_suggestion(): void
    {
        $leg = $this->pendingRemoteLeg();

        $this->as($this->user('seller'), 'seller')->post(route('seller.refills.remote', $leg))->assertForbidden();
        $this->as($this->keeper, 'seller')->post(route('seller.refills.remote', $leg))->assertForbidden();
        $this->as($this->keeper, 'stockkeeper')->post(route('stock_keeper.refills.accept', $leg))->assertForbidden();

        // A store manager ticked for manifests only cannot use the Remote Hub list,
        // and without the adjust tick may not change the amount.
        $limited = $this->user('seller', null);
        $this->storeNode()->syncManagers([$limited->id], null, [$limited->id => [FacilityManager::ADD_TO_MANIFEST, FacilityManager::ADD_TO_REMOTE_LIST]]);
        $this->as($limited, 'seller')->post(route('seller.refills.remote', $leg), ['quantity' => 3])->assertForbidden();
        $this->as($limited, 'seller')->post(route('seller.refills.cancel', $leg))->assertForbidden();
        $this->as($limited, 'seller')->post(route('seller.refills.remote', $leg))->assertSessionHas('success');

        // Another store's stock keeper cannot accept for this hub.
        $this->as($this->user('stock_keeper', Store::factory()->create()->id), 'stockkeeper')
            ->post(route('stock_keeper.refills.accept', $leg))->assertForbidden();
    }

    #[Test]
    public function a_suggestion_can_be_adjusted_or_cancelled_and_one_on_the_remote_list_cancelled_before_the_hub_accepts(): void
    {
        $leg = $this->pendingRemoteLeg();

        $this->as($this->manager, 'seller')->patch(route('seller.refills.update', $leg), ['quantity' => 12])->assertSessionHas('success');
        $this->assertSame([12, 45], [$leg->fresh()->quantity, $leg->fresh()->requested_quantity]);

        $this->as($this->manager, 'seller')->post(route('seller.refills.remote', $leg))->assertSessionHas('success');
        $this->as($this->manager, 'seller')->patch(route('seller.refills.update', $leg), ['quantity' => 30])->assertForbidden();

        $this->as($this->manager, 'seller')->post(route('seller.refills.cancel', $leg), ['reason' => 'Over-ordered'])->assertSessionHas('success');
        $this->assertSame([RefillRequest::STATUS_CANCELLED, 'Over-ordered', $this->manager->id], [$leg->fresh()->status, $leg->fresh()->cancel_reason, (int) $leg->fresh()->cancelled_by]);
        $this->as($this->manager, 'seller')->post(route('seller.refills.cancel', $leg))->assertForbidden();
    }

    #[Test]
    public function the_floor_part_never_waits_for_the_manager(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 50);
        $this->stock->receive($this->variant->id, $this->shelf, 5);

        $floorLeg = $this->leg(ItemRefillRoute::SOURCE_FLOOR);

        $this->as($this->manager, 'seller')->post(route('seller.refills.remote', $floorLeg))->assertForbidden();
        $this->as($this->manager, 'seller')->post(route('seller.refills.cancel', $floorLeg))->assertForbidden();
        $this->assertFalse($floorLeg->transfer->awaitsApproval());
    }

    #[Test]
    public function cancelling_the_shelving_transfer_cancels_its_leg(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 50);
        $this->stock->receive($this->variant->id, $this->shelf, 5);
        $floorLeg = $this->leg(ItemRefillRoute::SOURCE_FLOOR);

        app(TransferWorkflowService::class)->cancel($floorLeg->transfer, $this->keeper->id);

        $this->assertSame(RefillRequest::STATUS_CANCELLED, $floorLeg->fresh()->status);
    }

    #[Test]
    public function suggestions_are_built_into_a_shipment_from_the_chosen_hub_and_a_cancelled_one_hands_them_back(): void
    {
        $line = $this->shipmentSuggestion();
        $this->assertSame([45, true], [$line->quantity, $line->urgent]);

        $this->as($this->manager, 'seller')
            ->post(route('seller.refills.ship'), [
                'hub_location_id' => $this->hubA->id,
                'destination_location_id' => $this->floor->id,
                'lines' => [['id' => $line->id, 'quantity' => 40]],
            ])
            ->assertSessionHas('success');

        $line->refresh();
        $shipment = $line->shipment;
        $this->assertSame([RefillRequest::STATUS_IN_PROGRESS, 40, 45, RefillRequest::DESTINATION_STORE], [$line->status, $line->quantity, $line->requested_quantity, $line->destination]);
        $this->assertSame([$this->hubA->id, $this->floor->id], [(int) $shipment->origin_stock_location_id, (int) $shipment->destination_stock_location_id]);
        $this->assertSame(40, (int) $shipment->items()->where('item_variant_id', $this->variant->id)->value('quantity'));

        // Cancelled: back to a suggestion, at the amount asked.
        app(ShipmentWorkflowService::class)->transition($shipment, ShipmentWorkflowService::CANCELLED);
        $this->assertSame([RefillRequest::STATUS_PENDING, null, 45], [$line->fresh()->status, $line->fresh()->shipment_id, $line->fresh()->quantity]);
    }

    #[Test]
    public function the_replenishment_panel_adds_suggestions_to_an_open_manifest_and_unadded_ones_reappear_on_the_next(): void
    {
        $line = $this->shipmentSuggestion();
        $notebook = $this->secondItemSuggestion();

        $today = app(ShipmentWorkflowService::class)->createBetween($this->hubA, $this->floor, ['scheduled_for' => now()->addDays(3)->format('Y-m-d\TH:i')], $this->manager->id);

        $this->as($this->manager, 'seller')
            ->get(route('seller.shipments.show', $today))
            ->assertInertia(fn ($page) => $page
                ->where('replenishment.can_add', true)
                ->has('replenishment.suggestions', 2));

        // Only the pens go on this (later-day) manifest.
        $this->as($this->manager, 'seller')
            ->post(route('seller.refills.manifest', $today), ['lines' => [['id' => $line->id, 'quantity' => null]]])
            ->assertSessionHas('success');
        $this->assertSame([RefillRequest::STATUS_IN_PROGRESS, $today->id], [$line->fresh()->status, (int) $line->fresh()->shipment_id]);

        // The next manifest offers the notebooks again, not the pens already on a manifest.
        $next = app(ShipmentWorkflowService::class)->createBetween($this->hubA, $this->floor, [], $this->manager->id);
        $this->as($this->manager, 'seller')
            ->get(route('seller.shipments.show', $next))
            ->assertInertia(fn ($page) => $page
                ->has('replenishment.suggestions', 1)
                ->where('replenishment.suggestions.0.id', $notebook->id));
    }

    #[Test]
    public function a_line_taken_off_the_manifest_hands_its_suggestion_back_and_a_moved_one_takes_it_along(): void
    {
        $line = $this->shipmentSuggestion();
        $shipments = app(ShipmentWorkflowService::class);
        $first = $shipments->createBetween($this->hubA, $this->floor, [], $this->manager->id);
        $second = $shipments->createBetween($this->hubA, $this->floor, [], $this->manager->id);
        app(\App\Services\Inventory\RefillWorkflow::class)->addToManifest($first, [$line->id => null], $this->manager);

        $shipments->moveItemTo($first, $second, $this->variant);
        $this->assertSame([RefillRequest::STATUS_IN_PROGRESS, $second->id], [$line->fresh()->status, (int) $line->fresh()->shipment_id]);

        $shipments->removeItem($second->fresh(), $this->variant);
        $this->assertSame([RefillRequest::STATUS_PENDING, null], [$line->fresh()->status, $line->fresh()->shipment_id]);
    }

    #[Test]
    public function a_store_suggestion_may_be_shipped_to_the_remote_hub_instead(): void
    {
        $line = $this->shipmentSuggestion();

        $this->as($this->manager, 'seller')
            ->post(route('seller.refills.ship'), [
                'hub_location_id' => $this->hubA->id,
                'destination_location_id' => $this->remote->id,
                'lines' => [['id' => $line->id]],
            ])
            ->assertSessionHas('success');

        $line->refresh();
        $this->assertSame([RefillRequest::DESTINATION_REMOTE_HUB, $this->remote->id], [$line->destination, (int) $line->shipment->destination_stock_location_id]);

        // Received at the hub: with the Remote Hub on the route, the shelf now
        // asks the hub for it, as a new suggestion.
        app(RefillEngine::class)->setRoute($this->store->id, $this->item, ItemRefillRoute::DEFAULT_SOURCES);
        $this->stock->receive($this->variant->id, $this->remote, 45);
        $line->shipment->update(['status' => ShipmentWorkflowService::RECEIVED]);

        $this->assertSame(RefillRequest::STATUS_FULFILLED, $line->fresh()->status);
        $this->assertSame(RefillRequest::STATUS_PENDING, RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_REMOTE_HUB)->sole()->status);
    }

    #[Test]
    public function the_remote_hub_has_its_own_lines_and_restocks_only_by_shipment(): void
    {
        ShelfItemBand::query()->create(['stock_location_id' => $this->remote->id, 'item_id' => $this->item->id, 'max_units' => 200, 'refill_units' => 50, 'critical_units' => 20]);

        // Hub drops to its refill line: a suggestion to ship 160 to the hub.
        $this->stock->receive($this->variant->id, $this->remote, 60);
        $this->stock->adjust($this->variant->id, $this->remote, -20);

        $restock = RefillRequest::query()->where('target_location_id', $this->remote->id)->sole();
        $this->assertSame([ItemRefillRoute::SOURCE_SHIPMENT, RefillRequest::DESTINATION_REMOTE_HUB, 160, RefillRequest::STATUS_PENDING], [$restock->source, $restock->destination, $restock->quantity, $restock->status]);

        // It cannot go on the Remote Hub list, nor on a shipment to the store floor.
        $this->as($this->manager, 'seller')->post(route('seller.refills.remote', $restock))->assertForbidden();
        $this->as($this->manager, 'seller')
            ->post(route('seller.refills.ship'), ['hub_location_id' => $this->hubA->id, 'destination_location_id' => $this->floor->id, 'lines' => [['id' => $restock->id]]])
            ->assertSessionHas('error');

        $this->as($this->manager, 'seller')
            ->post(route('seller.refills.ship'), ['hub_location_id' => $this->hubA->id, 'destination_location_id' => $this->remote->id, 'lines' => [['id' => $restock->id]]])
            ->assertSessionHas('success');
        $this->assertSame(RefillRequest::STATUS_IN_PROGRESS, $restock->fresh()->status);

        // The shelf's own refills are untouched by the hub's restock.
        $this->assertSame(0, RefillRequest::query()->where('target_location_id', $this->shelf->id)->count());
    }

    #[Test]
    public function a_stock_keeper_raises_by_hand_and_may_skip_a_floor_whose_count_is_wrong(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 100);   // says 100; really empty
        $this->stock->receive($this->variant->id, $this->remote, 100);
        $this->stock->receive($this->variant->id, $this->shelf, 25);    // above the line: nothing automatic

        $this->as($this->keeper, 'stockkeeper')
            ->post(route('stock_keeper.shelves.refill', ['location' => $this->shelf, 'item' => $this->item]), ['start_at' => ItemRefillRoute::SOURCE_REMOTE_HUB])
            ->assertSessionHas('success');

        $leg = $this->leg(ItemRefillRoute::SOURCE_REMOTE_HUB);
        $this->assertSame([25, RefillRequest::ORIGIN_MANUAL, $this->keeper->id], [$leg->quantity, $leg->origin, (int) $leg->raised_by]);
        $this->assertSame(0, Transfer::query()->count());

        // Another store's stock keeper cannot.
        $this->as($this->user('stock_keeper', Store::factory()->create()->id), 'stockkeeper')
            ->post(route('stock_keeper.shelves.refill', ['location' => $this->shelf, 'item' => $this->item]))
            ->assertForbidden();
    }

    #[Test]
    public function the_suggestion_list_shows_the_stores_requests_with_what_each_viewer_may_do(): void
    {
        $leg = $this->pendingRemoteLeg();

        $this->as($this->manager, 'seller')
            ->get(route('seller.refills.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Seller/Refills/Index')
                ->where('board.can_rule', true)
                ->where('board.counts.pending', 1)
                ->where('board.counts.urgent', 1)
                ->where('board.rows.0.reference', $leg->reference)
                ->where('board.rows.0.stage', 'waiting')
                ->where('board.rows.0.can.add_to_remote', true)
                ->where('board.rows.0.can.add_to_manifest', true)
                ->where('board.rows.0.can.accept', false)
                ->where('board.hubs.0.id', $this->hubA->id)
                ->has('board.destinations', 2));

        // A seller of the store sees the same list, read-only.
        $this->as($this->user('seller'), 'seller')
            ->get(route('seller.refills.index'))
            ->assertInertia(fn ($page) => $page
                ->where('board.can_rule', false)
                ->where('board.rows.0.can.add_to_remote', false));
    }

    #[Test]
    public function the_permissions_page_lists_every_ability_read_only(): void
    {
        $this->as($this->user('seller'), 'seller')
            ->get(route('seller.refills.permissions'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Seller/Refills/Permissions')
                ->has('abilities', count(\App\Services\Inventory\StockPermissions::catalogue()))
                ->where('abilities', fn ($abilities) => collect($abilities)->pluck('key')->contains(\App\Services\Inventory\StockPermissions::EDIT_PLANOGRAM)));

        $this->as($this->keeper, 'stockkeeper')
            ->get(route('stock_keeper.shelving.permissions'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('StockKeeper/Shelving/Permissions'));
    }

    #[Test]
    public function the_shelving_list_shows_what_to_shelve_send_raise_and_what_became_of_each_request(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 10);
        $this->stock->receive($this->variant->id, $this->remote, 100);
        $this->stock->receive($this->variant->id, $this->shelf, 5);       // 45 short: 10 from the floor, 35 from the hub
        $remote = $this->leg(ItemRefillRoute::SOURCE_REMOTE_HUB);
        $this->as($this->manager, 'seller')->post(route('seller.refills.remote', $remote), ['quantity' => 30]);

        $notebook = Item::factory()->create(['product_name' => 'Notebook', 'status' => 'active']);
        ShelfItemBand::query()->create(['stock_location_id' => $this->shelf->id, 'item_id' => $notebook->id, 'max_units' => 10, 'refill_units' => 3, 'critical_units' => 1]);

        $floorTransfer = $this->leg(ItemRefillRoute::SOURCE_FLOOR)->transfer;

        $this->as($this->keeper, 'stockkeeper')
            ->get(route('stock_keeper.shelving.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('StockKeeper/Shelving/index')
                ->where('board.can_shelve', true)
                ->where('board.can_raise', true)
                ->where('board.to_shelve.0.transfer_id', $floorTransfer->id)
                ->where('board.to_shelve.0.urgent', true)
                ->where('board.to_accept.0.id', $remote->id)
                ->where('board.to_accept.0.can.accept', true)
                ->where('board.needs.0.name', 'Notebook')
                ->has('board.needs', 1)
                // What became of the request: on the Remote Hub list, adjusted 35 → 30.
                ->where('board.my_requests.0.id', $remote->id)
                ->where('board.my_requests.0.stage', 'remote_list')
                ->where('board.my_requests.0.adjusted', true)
                ->where('board.my_requests.0.requested_quantity', 35)
                ->where('board.my_requests.0.quantity', 30));

        $this->as($this->keeper, 'stockkeeper')
            ->post(route('stock_keeper.shelving.shelve', $floorTransfer))
            ->assertSessionHas('success');

        $this->assertSame(TransferWorkflowService::STATUS_COMPLETED, $floorTransfer->fresh()->status);
        $this->assertSame(RefillRequest::STATUS_FULFILLED, $this->leg(ItemRefillRoute::SOURCE_FLOOR)->status);
        $this->assertSame(15, $this->onShelf());

        // A seller cannot shelve, nor can another store's stock keeper.
        $this->stock->receive($this->variant->id, $this->floor, 5);
        $next = app(TransferWorkflowService::class)->create(
            variantId: $this->variant->id, fromStoreId: null, toStoreId: null, quantity: 5,
            sourceLocationType: StockLocation::class, sourceLocationId: $this->floor->id,
            destinationLocationType: StockLocation::class, destinationLocationId: $this->shelf->id,
        );
        $this->as($this->user('seller'), 'stockkeeper')->post(route('stock_keeper.shelving.shelve', $next))->assertForbidden();
        $this->as($this->user('stock_keeper', Store::factory()->create()->id), 'stockkeeper')
            ->post(route('stock_keeper.shelving.shelve', $next))->assertForbidden();
    }

    #[Test]
    public function a_stock_keeper_sees_their_request_on_a_manifest_with_its_date_or_cancelled_with_the_reason(): void
    {
        $line = $this->shipmentSuggestion();
        $when = now()->addDays(2)->startOfHour();
        $shipment = app(ShipmentWorkflowService::class)->createBetween($this->hubA, $this->floor, ['scheduled_for' => $when->format('Y-m-d\TH:i')], $this->manager->id);
        app(\App\Services\Inventory\RefillWorkflow::class)->addToManifest($shipment, [$line->id => 20], $this->manager);

        $other = $this->secondItemSuggestion();
        app(\App\Services\Inventory\RefillWorkflow::class)->cancel($other, $this->manager, 'Discontinued');

        $this->as($this->keeper, 'stockkeeper')
            ->get(route('stock_keeper.shelving.index'))
            ->assertInertia(fn ($page) => $page
                ->where('board.my_requests', function ($rows) use ($line, $other, $shipment) {
                    $rows = collect($rows)->keyBy('id');

                    return $rows[$line->id]['stage'] === 'on_manifest'
                        && $rows[$line->id]['shipment']['reference'] === $shipment->reference
                        && $rows[$line->id]['shipment']['scheduled_for'] !== null
                        && $rows[$line->id]['adjusted'] === true
                        && $rows[$other->id]['stage'] === 'cancelled'
                        && $rows[$other->id]['cancel_reason'] === 'Discontinued';
                }));
    }

    /* ------------------------------------------------------------------ */

    /** A shipment suggestion for 45 (pens skip the Remote Hub at this store). */
    private function shipmentSuggestion(): RefillRequest
    {
        app(RefillEngine::class)->setRoute($this->store->id, $this->item, [ItemRefillRoute::SOURCE_FLOOR, ItemRefillRoute::SOURCE_SHIPMENT]);
        $this->stock->receive($this->variant->id, $this->shelf, 5);

        return $this->leg(ItemRefillRoute::SOURCE_SHIPMENT);
    }

    /** A second item, notebooks, also waiting as a shipment suggestion. */
    private function secondItemSuggestion(): RefillRequest
    {
        $notebook = Item::factory()->create(['product_name' => 'Notebook', 'status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $notebook->id]);
        ShelfItemBand::query()->create(['stock_location_id' => $this->shelf->id, 'item_id' => $notebook->id, 'max_units' => 10, 'refill_units' => 3, 'critical_units' => 1]);
        app(RefillEngine::class)->setRoute($this->store->id, $notebook, [ItemRefillRoute::SOURCE_SHIPMENT]);
        $this->stock->receive($variant->id, $this->shelf, 2);

        return RefillRequest::query()->where('item_id', $notebook->id)->sole();
    }

    private function storeNode(): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->sole();
    }

    private function pendingRemoteLeg(): RefillRequest
    {
        $this->stock->receive($this->variant->id, $this->remote, 100);
        $this->stock->receive($this->variant->id, $this->shelf, 5);

        return $this->leg(ItemRefillRoute::SOURCE_REMOTE_HUB);
    }

    private function leg(string $source): RefillRequest
    {
        return RefillRequest::query()->where('source', $source)->where('item_id', $this->item->id)->sole();
    }

    private function onShelf(): int
    {
        return (int) ItemStock::query()->where('stock_location_id', $this->shelf->id)->sum('quantity');
    }

    private function user(string $role, ?int $storeId = -1): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId === -1 ? $this->store->id : $storeId]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function as(User $user, string $subdomain): self
    {
        $this->withServerVariables(['HTTP_HOST' => $subdomain.'.'.config('app.system_domain')]);
        $this->actingAs($user, 'web');

        return $this;
    }
}
