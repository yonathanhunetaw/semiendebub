<?php

declare(strict_types=1);

namespace Tests\Feature\Guide;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\StockLocation;
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

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

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
