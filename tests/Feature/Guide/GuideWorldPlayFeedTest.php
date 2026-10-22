<?php

declare(strict_types=1);

namespace Tests\Feature\Guide;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\FloorArea;
use App\Models\Inventory\LocationStaff;
use App\Models\Inventory\StockLocation;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Services\Inventory\StockLocationTree;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * `?play=1` on the Guide world route: what the Play mode can pick up now.
 * For the Store Floor → Store Shelf zone that is the stock keeper's shelving
 * list (floor → shelf transfers waiting), each with its unit and that unit's
 * size, and whether the viewer may shelve for real. Read only, Main Store only.
 */
class GuideWorldPlayFeedTest extends TestCase
{
    use RefreshDatabase;

    private Store $mainStore;

    private StockLocation $shelf;

    private StockLocation $floor;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'stock_keeper'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->mainStore = Store::factory()->create(['name' => 'Main Store']);
        app(StockLocationTree::class)->syncStore($this->mainStore);
        $this->shelf = $this->leaf(StockLocation::KIND_SHELF, 'Store Shelf', 'T-SHELF');
        $this->floor = $this->leaf(StockLocation::KIND_BACKROOM, 'Store', 'T-FLOOR');
    }

    #[Test]
    public function a_stock_keeper_gets_the_floor_to_shelf_transfers_waiting_with_their_unit_and_size(): void
    {
        $packet = ItemPackagingType::factory()->create(['name' => 'Packet']);
        $variant = ItemVariant::factory()->create(['item_packaging_type_id' => $packet->id]);
        $variant->packagingQuantities()->attach($packet->id, ['quantity' => 1, 'cbm' => 0.012]);
        $waiting = $this->floorToShelf($variant, ['reference' => 'TRF-WAIT', 'quantity' => 6]);
        $this->floorToShelf($variant, ['reference' => 'TRF-DONE', 'status' => 'completed']);

        $keeper = $this->user('stock_keeper', $this->mainStore->id);

        $this->asRole($keeper, 'stockkeeper')
            ->getJson(route('stock_keeper.guide.world', ['play' => 1]))
            ->assertOk()
            ->assertJsonPath('play.store.id', $this->mainStore->id)
            ->assertJsonPath('play.shelf.id', $this->shelf->id)
            ->assertJsonCount(1, 'play.to_shelve')
            ->assertJsonPath('play.to_shelve.0.transfer_id', $waiting->id)
            ->assertJsonPath('play.to_shelve.0.quantity', 6)
            ->assertJsonPath('play.to_shelve.0.unit', 'Packet')
            ->assertJsonPath('play.to_shelve.0.unit_cbm', 0.012)
            ->assertJsonPath('play.can_shelve', true)
            // Only Play's data: the day's replay is left out.
            ->assertJsonMissingPath('shipments');
    }

    #[Test]
    public function a_variant_with_no_size_recorded_comes_back_with_a_null_size(): void
    {
        $this->floorToShelf(ItemVariant::factory()->create(), ['reference' => 'TRF-NOSIZE']);

        $this->asRole($this->user('stock_keeper', $this->mainStore->id), 'stockkeeper')
            ->getJson(route('stock_keeper.guide.world', ['play' => 1]))
            ->assertOk()
            ->assertJsonPath('play.to_shelve.0.unit_cbm', null);
    }

    #[Test]
    public function a_seller_sees_the_same_list_but_may_not_shelve(): void
    {
        $this->floorToShelf(ItemVariant::factory()->create(), ['reference' => 'TRF-SELLER']);

        $this->asRole($this->user('seller', $this->mainStore->id), 'seller')
            ->getJson(route('seller.guide.world', ['play' => 1]))
            ->assertOk()
            ->assertJsonCount(1, 'play.to_shelve')
            ->assertJsonPath('play.can_shelve', false);
    }

    #[Test]
    public function a_user_tied_to_another_store_gets_nothing_to_play_with(): void
    {
        $this->floorToShelf(ItemVariant::factory()->create(), ['reference' => 'TRF-ELSEWHERE']);
        $elsewhere = Store::factory()->create(['name' => 'Second Store']);

        $this->asRole($this->user('seller', $elsewhere->id), 'seller')
            ->getJson(route('seller.guide.world', ['play' => 1]))
            ->assertOk()
            ->assertJsonPath('play.store', null)
            ->assertJsonCount(0, 'play.to_shelve')
            ->assertJsonPath('play.can_shelve', false);
    }

    #[Test]
    public function the_freight_car_gets_the_scheduled_shipments_from_a_main_hub_with_their_lines(): void
    {
        $tree = app(StockLocationTree::class);
        $remoteHub = $tree->addRemoteHub($this->mainStore);
        $hubA = $tree->syncStore(Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]));

        $carton = ItemPackagingType::factory()->create(['name' => 'Carton']);
        $variant = ItemVariant::factory()->create(['item_packaging_type_id' => $carton->id]);
        $variant->packagingQuantities()->attach($carton->id, ['quantity' => 24, 'cbm' => 0.05]);
        $area = FloorArea::query()->create(['stock_location_id' => $hubA->id, 'code' => 'A3', 'x_m' => 1, 'y_m' => 1, 'width_m' => 2, 'length_m' => 2]);
        $area->items()->attach($variant->item_id);

        $scheduled = $this->shipmentFrom($hubA, $remoteHub, 'scheduled', ['vehicle_max_cbm' => 18.5]);
        $scheduled->items()->create(['item_variant_id' => $variant->id, 'quantity' => 30, 'picked_quantity' => 12, 'cbm' => 1.5]);
        $this->shipmentFrom($hubA, $remoteHub, 'draft');
        $this->shipmentFrom($hubA, $remoteHub, 'dispatched');

        $this->asRole($this->user('stock_keeper', $this->mainStore->id), 'stockkeeper')
            ->getJson(route('stock_keeper.guide.world', ['play' => 1]))
            ->assertOk()
            ->assertJsonCount(1, 'play.loads')
            ->assertJsonPath('play.loads.0.id', $scheduled->id)
            ->assertJsonPath('play.loads.0.origin', 'main_hub_a')
            ->assertJsonPath('play.loads.0.destination', 'remote_hub')
            ->assertJsonPath('play.loads.0.vehicle.max_cbm', 18.5)
            ->assertJsonPath('play.loads.0.lines.0.variant_id', $variant->id)
            ->assertJsonPath('play.loads.0.lines.0.unit', 'Carton')
            ->assertJsonPath('play.loads.0.lines.0.quantity', 30)
            ->assertJsonPath('play.loads.0.lines.0.picked_quantity', 12)
            ->assertJsonPath('play.loads.0.lines.0.line_cbm', 1.5)
            ->assertJsonPath('play.loads.0.lines.0.unit_cbm', 0.05)
            ->assertJsonPath('play.loads.0.lines.0.area', 'A3')
            // The store's keeper does not work Hub A's dock: they may not pick it for real.
            ->assertJsonPath('play.loads.0.can_pick', false);

        // A hub keeper (no store, staff of Hub A) may: the same check the step route makes.
        $hubKeeper = $this->user('stock_keeper', null);
        LocationStaff::query()->create(['stock_location_id' => $hubA->id, 'user_id' => $hubKeeper->id]);
        $this->asRole($hubKeeper, 'stockkeeper')
            ->getJson(route('stock_keeper.guide.world', ['play' => 1]))
            ->assertOk()
            ->assertJsonPath('play.loads.0.id', $scheduled->id)
            ->assertJsonPath('play.loads.0.can_pick', true);

        // Nothing for someone at another store.
        $elsewhere = Store::factory()->create(['name' => 'Second Store']);
        $this->asRole($this->user('stock_keeper', $elsewhere->id), 'stockkeeper')
            ->getJson(route('stock_keeper.guide.world', ['play' => 1]))
            ->assertOk()
            ->assertJsonCount(0, 'play.loads');
    }

    #[Test]
    public function the_runs_list_shipments_after_prepared_with_the_steps_the_viewer_may_take(): void
    {
        $tree = app(StockLocationTree::class);
        $remoteHub = $tree->addRemoteHub($this->mainStore);
        $hubA = $tree->syncStore(Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]));
        $variant = ItemVariant::factory()->create();

        $ready = $this->shipmentFrom($hubA, $remoteHub, 'ready');
        $ready->items()->create(['item_variant_id' => $variant->id, 'quantity' => 10, 'picked_quantity' => 10]);
        $this->shipmentFrom($hubA, $remoteHub, 'scheduled');
        $this->shipmentFrom($hubA, $remoteHub, 'received');

        // The store's keeper is not the driver and does not work the hub dock: nothing to take yet at the start.
        $this->asRole($this->user('stock_keeper', $this->mainStore->id), 'stockkeeper')
            ->getJson(route('stock_keeper.guide.world', ['play' => 1]))
            ->assertOk()
            ->assertJsonCount(1, 'play.runs')
            ->assertJsonPath('play.runs.0.id', $ready->id)
            ->assertJsonPath('play.runs.0.stage', 'prepared')
            ->assertJsonPath('play.runs.0.origin', 'main_hub_a')
            ->assertJsonPath('play.runs.0.destination', 'remote_hub')
            ->assertJsonPath('play.runs.0.lines.0.quantity', 10)
            ->assertJsonPath('play.runs.0.lines.0.received', null)
            ->assertJsonPath('play.runs.0.steps', []);

        // The driver on the run may start the trip.
        $driver = $this->user('delivery', null);
        $ready->update(['courier_id' => $driver->id]);
        $this->asRole($driver, 'delivery')
            ->getJson(route('delivery.guide.world', ['play' => 1]))
            ->assertOk()
            ->assertJsonPath('play.runs.0.courier', trim($driver->first_name.' '.$driver->last_name))
            ->assertJsonPath('play.runs.0.steps.0', 'courier_start');
    }

    #[Test]
    public function the_legs_list_transfers_between_sites_with_the_steps_each_viewer_may_take_but_not_the_shelving_moves(): void
    {
        $remoteHub = app(StockLocationTree::class)->addRemoteHub($this->mainStore);
        $variant = ItemVariant::factory()->create();
        $this->floorToShelf($variant, ['reference' => 'TRF-SHELVING']);
        $leg = $this->fromRemoteHub($remoteHub, $variant, ['reference' => 'TRF-LEG']);

        $keeper = $this->user('stock_keeper', $this->mainStore->id);
        $response = $this->asRole($keeper, 'stockkeeper')->getJson(route('stock_keeper.guide.world', ['play' => 1]))->assertOk();
        // The floor → shelf move is the shelving job, not a leg.
        $response->assertJsonCount(1, 'play.legs')
            ->assertJsonPath('play.legs.0.reference', 'TRF-LEG')
            ->assertJsonPath('play.legs.0.stage', 'waiting')
            ->assertJsonPath('play.legs.0.origin', 'remote_hub')
            ->assertJsonPath('play.legs.0.destination', 'store_floor')
            ->assertJsonPath('play.legs.0.needs_courier', true);
        // No courier yet: nobody on the stock keeper side can dispatch.
        $this->assertNotContains('dispatch', $response->json('play.legs.0.steps'));
        $this->assertNotContains('claim', $response->json('play.legs.0.steps'));

        // A courier may claim it.
        $courier = $this->user('delivery', null);
        $this->asRole($courier, 'delivery')
            ->getJson(route('delivery.guide.world', ['play' => 1]))
            ->assertOk()
            ->assertJsonPath('play.legs.0.steps.0', 'claim');

        // Once claimed it is waiting for the origin to dispatch.
        $leg->update(['courier_id' => $courier->id]);
        $this->asRole($keeper, 'stockkeeper')
            ->getJson(route('stock_keeper.guide.world', ['play' => 1]))
            ->assertJsonPath('play.legs.0.stage', 'claimed')
            ->assertJsonPath('play.legs.0.courier', trim($courier->first_name.' '.$courier->last_name));

        // A seller never sees what moves out of the Remote Hub.
        $this->asRole($this->user('seller', $this->mainStore->id), 'seller')
            ->getJson(route('seller.guide.world', ['play' => 1]))
            ->assertJsonCount(0, 'play.legs');
    }

    #[Test]
    public function the_receiving_desk_lists_open_discrepancies_and_only_offers_settling_to_someone_who_did_not_record_them(): void
    {
        $hub = app(StockLocationTree::class)->syncStore(Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]));
        $variant = ItemVariant::factory()->create();
        $recorder = $this->user('stock_keeper', $this->mainStore->id);
        $row = \App\Models\Inventory\ReceiptDiscrepancy::query()->create([
            'reference' => 'RD-TEST-1', 'receivable_type' => Shipment::class, 'receivable_id' => $this->shipmentFrom($hub, $this->floor, 'received')->id,
            'item_variant_id' => $variant->id, 'stock_location_id' => $this->floor->id, 'kind' => 'short',
            'expected' => 10, 'received' => 7, 'quantity' => 3, 'status' => 'open', 'recorded_by' => $recorder->id,
        ]);

        // Someone else settles it.
        $other = $this->user('stock_keeper', $this->mainStore->id);
        $station = collect($this->asRole($other, 'stockkeeper')->getJson(route('stock_keeper.guide.world', ['play' => 1]))->assertOk()->json('play.stations'))->firstWhere('key', 'receiving');
        $this->assertSame('desk_receiving', $station['desk']);
        $this->assertCount(1, $station['items']);
        $this->assertSame((string) $row->id, $station['items'][0]['id']);
        $this->assertSame(['found', 'lost', 'accepted'], array_column($station['items'][0]['actions'], 'key'));
        $this->assertSame(route('stock_keeper.receiving.resolve', $row->id, false), $station['items'][0]['actions'][0]['url']);
        $this->assertSame(['resolution' => 'found'], $station['items'][0]['actions'][0]['data']);

        // Whoever counted it may not settle it.
        $mine = collect($this->asRole($recorder, 'stockkeeper')->getJson(route('stock_keeper.guide.world', ['play' => 1]))->json('play.stations'))->firstWhere('key', 'receiving');
        $this->assertSame([], $mine['items'][0]['actions']);

        // Sellers and couriers have no receiving desk.
        $keys = array_column($this->asRole($this->user('seller', $this->mainStore->id), 'seller')->getJson(route('seller.guide.world', ['play' => 1]))->json('play.stations'), 'key');
        $this->assertNotContains('receiving', $keys);
    }

    #[Test]
    public function the_remote_hub_job_lists_what_waits_for_a_courier_but_never_for_a_seller(): void
    {
        $remoteHub = app(StockLocationTree::class)->addRemoteHub($this->mainStore);
        $carton = ItemPackagingType::factory()->create(['name' => 'Carton']);
        $variant = ItemVariant::factory()->create(['item_packaging_type_id' => $carton->id]);
        $variant->packagingQuantities()->attach($carton->id, ['quantity' => 12, 'cbm' => 0.04]);

        // A leg on the Remote Hub list, for the hub to accept…
        \App\Models\Inventory\RefillRequest::query()->create([
            'reference' => 'RF-REMOTE', 'store_id' => $this->mainStore->id, 'item_id' => $variant->item_id, 'item_variant_id' => $variant->id,
            'source' => 'remote_hub', 'quantity' => 3, 'status' => 'in_progress',
        ]);
        // …a transfer waiting for its courier, and one already completed (left out).
        $waiting = $this->fromRemoteHub($remoteHub, $variant, ['reference' => 'TRF-REMOTE', 'quantity' => 5]);
        $this->fromRemoteHub($remoteHub, $variant, ['reference' => 'TRF-DONE', 'status' => 'completed']);

        $this->asRole($this->user('stock_keeper', $this->mainStore->id), 'stockkeeper')
            ->getJson(route('stock_keeper.guide.world', ['play' => 1]))
            ->assertOk()
            ->assertJsonCount(2, 'play.remote')
            ->assertJsonPath('play.remote.0.reference', 'RF-REMOTE')
            ->assertJsonPath('play.remote.0.stage', 'to_accept')
            ->assertJsonPath('play.remote.0.quantity', 3)
            ->assertJsonPath('play.remote.1.key', 'transfer-'.$waiting->id)
            ->assertJsonPath('play.remote.1.stage', 'pending')
            ->assertJsonPath('play.remote.1.unit', 'Carton')
            ->assertJsonPath('play.remote.1.unit_cbm', 0.04);

        // A seller may see the Remote Hub only as "stocked" or not: no quantities, so no job.
        $this->asRole($this->user('seller', $this->mainStore->id), 'seller')
            ->getJson(route('seller.guide.world', ['play' => 1]))
            ->assertOk()
            ->assertJsonCount(0, 'play.remote');
    }

    #[Test]
    public function the_replay_is_unchanged_without_play(): void
    {
        $this->asRole($this->user('admin', null), 'admin')
            ->getJson(route('admin.guide.world', ['from' => '2026-10-14']))
            ->assertOk()
            ->assertJsonMissingPath('play')
            ->assertJsonStructure(['shipments', 'refills', 'orders', 'events', 'days']);
    }

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

    private function leaf(string $kind, string $name, string $code): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->mainStore->id)->where('kind', $kind)->first()
            ?? StockLocation::query()->create([
                'parent_id' => StockLocation::query()->where('store_id', $this->mainStore->id)->where('kind', StockLocation::KIND_STORE)->value('id'),
                'kind' => $kind, 'name' => $name, 'code' => $code, 'status' => 'active',
                'store_id' => $this->mainStore->id, 'is_stockable' => true,
            ]);
    }

    /** @param array<string, mixed> $attributes */
    private function floorToShelf(ItemVariant $variant, array $attributes): Transfer
    {
        return Transfer::query()->create($attributes + [
            'item_variant_id' => $variant->id, 'from_store_id' => $this->mainStore->id, 'to_store_id' => $this->mainStore->id,
            'source_location_type' => StockLocation::class, 'source_location_id' => $this->floor->id,
            'destination_location_type' => StockLocation::class, 'destination_location_id' => $this->shelf->id,
            'quantity' => 4, 'status' => 'pending', 'origin' => Transfer::ORIGIN_MANUAL,
            'approval_state' => Transfer::APPROVAL_NOT_REQUIRED,
        ]);
    }

    /** @param array<string, mixed> $attributes */
    private function fromRemoteHub(StockLocation $remoteHub, ItemVariant $variant, array $attributes): Transfer
    {
        return Transfer::query()->create($attributes + [
            'item_variant_id' => $variant->id, 'from_store_id' => $this->mainStore->id, 'to_store_id' => $this->mainStore->id,
            'source_location_type' => StockLocation::class, 'source_location_id' => $remoteHub->id,
            'destination_location_type' => StockLocation::class, 'destination_location_id' => $this->floor->id,
            'quantity' => 4, 'status' => 'pending', 'origin' => Transfer::ORIGIN_MANUAL,
            'approval_state' => Transfer::APPROVAL_NOT_REQUIRED,
        ]);
    }

    /** @param array<string, mixed> $attributes */
    private function shipmentFrom(StockLocation $origin, StockLocation $destination, string $status, array $attributes = []): Shipment
    {
        return Shipment::query()->create($attributes + [
            'reference' => 'SHP-'.uniqid(),
            'origin_store_id' => $origin->legacy_id,
            'destination_store_id' => $this->mainStore->id,
            'origin_stock_location_id' => $origin->id,
            'destination_stock_location_id' => $destination->id,
            'status' => $status,
        ]);
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    private function asRole(User $user, string $subdomain): self
    {
        $this->withServerVariables(['HTTP_HOST' => "{$subdomain}.localhost"]);
        $this->actingAs($user, 'web');

        return $this;
    }
}
