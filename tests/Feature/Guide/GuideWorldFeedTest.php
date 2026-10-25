<?php

declare(strict_types=1);

namespace Tests\Feature\Guide;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\Inventory\StockLocationTree;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The feed the Guide's Live Operations world replays: shipments alive on a
 * day, each end mapped onto a place the world draws, with every tick and step
 * timestamp, scoped to the viewer's store.
 */
class GuideWorldFeedTest extends TestCase
{
    use RefreshDatabase;

    private Store $mainStore;

    private StockLocation $hubA;

    private StockLocation $remoteHub;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $tree = app(StockLocationTree::class);
        $this->mainStore = Store::factory()->create(['name' => 'Main Store']);
        $tree->syncStore($this->mainStore);
        $this->remoteHub = $tree->addRemoteHub($this->mainStore);

        $hub = Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $this->hubA = $tree->syncStore($hub);
    }

    #[Test]
    public function it_maps_a_days_shipments_onto_the_worlds_places_with_their_timestamps(): void
    {
        $day = CarbonImmutable::parse('2026-10-14 00:00');
        $shipment = $this->shipment([
            'created_at' => $day->setTime(8, 0),
            'picked_at' => $day->setTime(9, 0),
            'prepared_at' => $day->setTime(9, 30),
            'party_agreements' => ['creator' => ['status' => 'accepted', 'at' => $day->setTime(8, 5)->toIso8601String()]],
        ]);

        $this->asRole($this->user('admin', null), 'admin')
            ->getJson(route('admin.guide.world', ['from' => '2026-10-14', 'to' => '2026-10-14']))
            ->assertOk()
            ->assertJsonPath('shipments.0.id', $shipment->id)
            ->assertJsonPath('shipments.0.origin.place', 'main_hub_a')
            ->assertJsonPath('shipments.0.destination.place', 'remote_hub')
            ->assertJsonPath('shipments.0.parties.0.party', 'creator')
            ->assertJsonPath('shipments.0.parties.0.status', 'accepted')
            ->assertJsonPath('shipments.0.steps.picked', $day->setTime(9, 0)->toIso8601String())
            ->assertJsonPath('shipments.0.steps.prepared', $day->setTime(9, 30)->toIso8601String())
            ->assertJsonPath('shipments.0.steps.received', null);
    }

    #[Test]
    public function a_shipment_received_before_the_day_is_left_out(): void
    {
        $this->shipment([
            'created_at' => CarbonImmutable::parse('2026-10-10 08:00'),
            'received_at' => CarbonImmutable::parse('2026-10-11 12:00'),
            'status' => 'received',
        ]);

        $this->asRole($this->user('admin', null), 'admin')
            ->getJson(route('admin.guide.world', ['from' => '2026-10-14']))
            ->assertOk()
            ->assertJsonCount(0, 'shipments');
    }

    #[Test]
    public function a_user_tied_to_another_store_sees_only_that_stores_shipments(): void
    {
        $this->shipment(['created_at' => CarbonImmutable::parse('2026-10-14 08:00')]);
        $elsewhere = Store::factory()->create(['name' => 'Second Store']);

        $this->asRole($this->user('seller', $elsewhere->id), 'seller')
            ->getJson(route('seller.guide.world', ['from' => '2026-10-14']))
            ->assertOk()
            ->assertJsonCount(0, 'shipments');

        $this->asRole($this->user('seller', $this->mainStore->id), 'seller')
            ->getJson(route('seller.guide.world', ['from' => '2026-10-14']))
            ->assertOk()
            ->assertJsonCount(1, 'shipments');
    }

    #[Test]
    public function the_shelf_bins_come_back_only_when_asked_for_and_only_for_the_main_store(): void
    {
        $item = \App\Models\Item\Item::factory()->create(['product_name' => 'Pen – Bic']);
        $shelf = StockLocation::query()->where('store_id', $this->mainStore->id)->where('kind', StockLocation::KIND_SHELF)->first()
            ?? StockLocation::query()->create([
                'parent_id' => StockLocation::query()->where('store_id', $this->mainStore->id)->where('kind', StockLocation::KIND_STORE)->value('id'),
                'kind' => StockLocation::KIND_SHELF, 'name' => 'Store Shelf', 'code' => 'T-SHELF', 'status' => 'active',
                'store_id' => $this->mainStore->id, 'is_stockable' => true,
            ]);
        \App\Models\Inventory\ShelfItemBand::query()->create(['stock_location_id' => $shelf->id, 'item_id' => $item->id, 'max_units' => 80, 'refill_units' => 32, 'critical_units' => 12]);

        $admin = $this->user('admin', null);

        $this->asRole($admin, 'admin')
            ->getJson(route('admin.guide.world', ['from' => '2026-10-14']))
            ->assertOk()
            ->assertJsonMissingPath('shelf');

        $this->asRole($admin, 'admin')
            ->getJson(route('admin.guide.world', ['from' => '2026-10-14', 'shelf' => 1]))
            ->assertOk()
            ->assertJsonCount(1, 'shelf')
            ->assertJsonPath('shelf.0.name', 'Pen – Bic')
            ->assertJsonPath('shelf.0.status', 'empty')
            ->assertJsonPath('shelf.0.band.max', 80);

        $elsewhere = Store::factory()->create(['name' => 'Second Store']);
        $this->asRole($this->user('seller', $elsewhere->id), 'seller')
            ->getJson(route('seller.guide.world', ['from' => '2026-10-14', 'shelf' => 1]))
            ->assertOk()
            ->assertJsonCount(0, 'shelf');
    }

    #[Test]
    public function a_day_with_only_a_refill_counts_as_busy(): void
    {
        $day = CarbonImmutable::now()->subDays(3)->setTime(10, 0);
        $variant = \App\Models\Item\ItemVariant::factory()->create();
        $refill = \App\Models\Inventory\RefillRequest::query()->create([
            'reference' => 'RF-'.uniqid(),
            'store_id' => $this->mainStore->id,
            'item_id' => $variant->item_id,
            'item_variant_id' => $variant->id,
            'source' => 'floor',
            'quantity' => 6,
            'status' => 'pending',
        ]);
        $refill->created_at = $day;
        $refill->save();

        $this->asRole($this->user('admin', null), 'admin')
            ->getJson(route('admin.guide.world', ['from' => $day->toDateString()]))
            ->assertOk()
            ->assertJsonCount(1, 'refills')
            ->assertJsonPath('refills.0.raised_at', $day->toIso8601String())
            ->assertJsonFragment(['days' => [$day->toDateString()]]);
    }

    #[Test]
    public function a_transfer_raised_by_hand_comes_back_as_events_but_one_tied_to_a_refill_does_not(): void
    {
        $day = CarbonImmutable::parse('2026-10-14 00:00');
        $variant = \App\Models\Item\ItemVariant::factory()->create();
        $floor = $this->floor();

        $manual = $this->transfer($variant, $floor, ['reference' => 'TRF-HAND', 'created_at' => $day->setTime(9, 0), 'dispatched_at' => $day->setTime(9, 30), 'completed_at' => $day->setTime(10, 0)]);
        $tied = $this->transfer($variant, $floor, ['reference' => 'TRF-REFILL', 'created_at' => $day->setTime(9, 0)]);
        \App\Models\Inventory\RefillRequest::query()->create([
            'reference' => 'RF-1', 'store_id' => $this->mainStore->id, 'item_id' => $variant->item_id, 'item_variant_id' => $variant->id,
            'source' => 'remote_hub', 'quantity' => 4, 'status' => 'pending', 'transfer_id' => $tied->id,
        ]);

        $response = $this->asRole($this->user('admin', null), 'admin')
            ->getJson(route('admin.guide.world', ['from' => $day->toDateString()]))
            ->assertOk();

        $events = collect($response->json('events'))->where('kind', 'transfer');
        $this->assertSame(['transfer-'.$manual->id.'-raised', 'transfer-'.$manual->id.'-dispatched', 'transfer-'.$manual->id.'-completed'], $events->pluck('key')->all());
        $this->assertSame(['remote_hub', 'remote_hub', 'store_floor'], $events->pluck('where')->all());
        $this->assertTrue((bool) $events->last()['final']);
    }

    #[Test]
    public function a_stocktake_of_the_main_stores_floor_comes_back_as_count_events(): void
    {
        $day = CarbonImmutable::parse('2026-10-14 00:00');
        $floor = $this->floor();
        $keeper = $this->user('admin', null);

        $count = \App\Models\Inventory\Stocktake::query()->create(['reference' => 'CNT-1', 'stock_location_id' => $floor->id, 'status' => 'posted', 'started_by' => $keeper->id]);
        $count->forceFill(['created_at' => $day->setTime(8, 0), 'submitted_at' => $day->setTime(8, 30), 'posted_at' => $day->setTime(9, 0)])->save();

        $events = collect($this->asRole($keeper, 'admin')
            ->getJson(route('admin.guide.world', ['from' => $day->toDateString()]))
            ->assertOk()
            ->json('events'))->where('kind', 'count');

        $this->assertSame(['count-'.$count->id.'-started', 'count-'.$count->id.'-submitted', 'count-'.$count->id.'-posted'], $events->pluck('key')->all());
        $this->assertSame(['store_floor'], $events->pluck('where')->unique()->values()->all());
    }

    #[Test]
    public function count_events_name_the_person_who_did_each_step(): void
    {
        $day = CarbonImmutable::parse('2026-10-14 00:00');
        $keeper = $this->user('admin', null);
        $keeper->update(['first_name' => 'Abel']);

        $count = \App\Models\Inventory\Stocktake::query()->create(['reference' => 'CNT-2', 'stock_location_id' => $this->floor()->id, 'status' => 'posted', 'started_by' => $keeper->id]);
        $count->forceFill(['created_at' => $day->setTime(8, 0)])->save();

        $events = collect($this->asRole($keeper, 'admin')->getJson(route('admin.guide.world', ['from' => $day->toDateString()]))->assertOk()->json('events'))->where('kind', 'count');

        $this->assertSame('Abel starts a count', $events->first()['what']);
    }

    #[Test]
    public function a_site_opening_and_a_clock_in_come_back_as_named_work_events(): void
    {
        $day = CarbonImmutable::parse('2026-10-14 00:00');
        $admin = $this->user('admin', null);
        $opener = $this->user('stock_keeper', null);
        $opener->update(['first_name' => 'Sara']);
        $site = $this->floor();

        $siteDay = \App\Models\Workforce\SiteDay::query()->create(['stock_location_id' => $site->id, 'date' => $day->toDateString(), 'status' => 'open', 'opener_id' => $opener->id, 'opened_by' => $opener->id, 'opened_at' => $day->setTime(8, 0)]);
        \App\Models\Workforce\TimeEntry::query()->create(['user_id' => $opener->id, 'stock_location_id' => $site->id, 'clock_in_at' => $day->setTime(7, 55), 'in_method' => 'qr']);

        $events = collect($this->asRole($admin, 'admin')->getJson(route('admin.guide.world', ['from' => $day->toDateString()]))->assertOk()->json('events'))->where('kind', 'work');

        $opened = $events->firstWhere('key', "site-{$siteDay->id}-opened");
        $this->assertNotNull($opened, json_encode($events->pluck('key')));
        $this->assertStringStartsWith('Sara opens', $opened['what']);
        $this->assertContains('Sara clocks in', $events->pluck('what')->all());
    }

    #[Test]
    public function a_user_tied_to_another_store_gets_no_transfer_or_count_events(): void
    {
        $this->transfer(\App\Models\Item\ItemVariant::factory()->create(), $this->floor(), ['reference' => 'TRF-X', 'created_at' => CarbonImmutable::parse('2026-10-14 09:00')]);
        $elsewhere = Store::factory()->create(['name' => 'Second Store']);

        $this->asRole($this->user('seller', $elsewhere->id), 'seller')
            ->getJson(route('seller.guide.world', ['from' => '2026-10-14']))
            ->assertOk()
            ->assertJsonCount(0, 'events');
    }

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

    private function floor(): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->mainStore->id)->where('kind', StockLocation::KIND_BACKROOM)->first()
            ?? StockLocation::query()->create([
                'parent_id' => StockLocation::query()->where('store_id', $this->mainStore->id)->where('kind', StockLocation::KIND_STORE)->value('id'),
                'kind' => StockLocation::KIND_BACKROOM, 'name' => 'Store Floor', 'code' => 'T-FLOOR', 'status' => 'active',
                'store_id' => $this->mainStore->id, 'is_stockable' => true,
            ]);
    }

    /** A transfer from the Remote Hub to the floor; `created_at` is set apart, as it is not fillable. */
    private function transfer(\App\Models\Item\ItemVariant $variant, StockLocation $floor, array $attributes): \App\Models\StockKeeper\Transfer
    {
        $transfer = new \App\Models\StockKeeper\Transfer(array_diff_key($attributes, ['created_at' => true]) + [
            'item_variant_id' => $variant->id, 'from_store_id' => $this->mainStore->id, 'to_store_id' => $this->mainStore->id,
            'source_location_type' => StockLocation::class, 'source_location_id' => $this->remoteHub->id,
            'destination_location_type' => StockLocation::class, 'destination_location_id' => $floor->id,
            'quantity' => 4, 'status' => 'pending', 'origin' => \App\Models\StockKeeper\Transfer::ORIGIN_MANUAL,
            'approval_state' => \App\Models\StockKeeper\Transfer::APPROVAL_NOT_REQUIRED,
        ]);
        $transfer->created_at = $attributes['created_at'];
        $transfer->save();

        return $transfer;
    }

    /** @param array<string, mixed> $attributes */
    private function shipment(array $attributes): Shipment
    {
        $shipment = new Shipment(array_merge([
            'reference' => 'SHP-'.uniqid(),
            'origin_store_id' => $this->hubA->legacy_id,
            'destination_store_id' => $this->mainStore->id,
            'origin_stock_location_id' => $this->hubA->id,
            'destination_stock_location_id' => $this->remoteHub->id,
            'status' => 'picking',
        ], array_diff_key($attributes, ['created_at' => true])));
        $shipment->created_at = $attributes['created_at'];
        $shipment->save();

        return $shipment;
    }

    #[Test]
    public function the_catalogue_gives_one_box_per_item_in_its_biggest_packaging(): void
    {
        $piece = ItemPackagingType::factory()->create(['name' => 'Piece']);
        $carton = ItemPackagingType::factory()->create(['name' => 'Cartoon']);
        $box = ItemPackagingType::factory()->create(['name' => 'Box']);

        $cups = Item::factory()->create(['product_name' => 'Cups']);
        ItemVariant::factory()->create(['item_id' => $cups->id, 'item_packaging_type_id' => $piece->id]);
        $cupsCarton = ItemVariant::factory()->create(['item_id' => $cups->id, 'item_packaging_type_id' => $carton->id]);
        $cupsCarton->packagingQuantities()->attach($carton->id, ['quantity' => 48, 'cbm' => 0.064]);
        ItemVariant::factory()->create(['item_id' => $cups->id, 'item_packaging_type_id' => $box->id]);

        $bowls = Item::factory()->create(['product_name' => 'Bowls']);
        $bowlsPiece = ItemVariant::factory()->create(['item_id' => $bowls->id, 'item_packaging_type_id' => $piece->id]);

        $this->asRole($this->user('admin', null), 'admin')
            ->getJson(route('admin.guide.world', ['catalogue' => 1]))
            ->assertOk()
            ->assertJsonCount(2, 'catalogue')
            // By name: Bowls, then Cups.
            ->assertJsonPath('catalogue.0.variant_id', $bowlsPiece->id)
            ->assertJsonPath('catalogue.0.tier', 'piece')
            ->assertJsonPath('catalogue.0.cbm', null)
            ->assertJsonPath('catalogue.1.name', 'Cups')
            ->assertJsonPath('catalogue.1.variant_id', $cupsCarton->id)
            ->assertJsonPath('catalogue.1.tier', 'cartoon')
            ->assertJsonPath('catalogue.1.pieces', 48)
            ->assertJsonPath('catalogue.1.cbm', 0.064);
    }

    #[Test]
    public function the_catalogue_counts_the_real_boxes_each_place_holds_from_its_stock(): void
    {
        $carton = ItemPackagingType::factory()->create(['name' => 'Cartoon']);
        $cups = Item::factory()->create(['product_name' => 'Cups']);
        $cupsCarton = ItemVariant::factory()->create(['item_id' => $cups->id, 'item_packaging_type_id' => $carton->id]);
        $cupsCarton->packagingQuantities()->attach($carton->id, ['quantity' => 48, 'cbm' => 0.064]);

        // 5 cartons (a carton variant's unit is 48 pieces) in Hub A, and one on the shop floor; nothing in Hub B.
        app(\App\Services\StockService::class)->receive($cupsCarton->id, $this->hubA, 5);
        app(\App\Services\StockService::class)->receive($cupsCarton->id, $this->floor(), 1);

        $boxes = $this->asRole($this->user('admin', null), 'admin')
            ->getJson(route('admin.guide.world', ['catalogue' => 1]))
            ->assertOk()
            ->json('catalogue.0.boxes');

        $this->assertSame(['main_hub_a' => 5, 'store_floor' => 1], $boxes);
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
