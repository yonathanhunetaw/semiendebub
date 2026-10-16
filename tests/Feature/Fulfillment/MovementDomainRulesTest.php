<?php

declare(strict_types=1);

namespace Tests\Feature\Fulfillment;

use App\Exceptions\MovementDomainException;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Store\Store;
use App\Services\Fulfillment\MovementDomainService as Domain;
use App\Services\Inventory\StockLocationTree;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * MovementDomainService: what kind of node each place is, and the rules a
 * transfer and a delivery must keep.
 */
class MovementDomainRulesTest extends TestCase
{
    use RefreshDatabase;

    private Domain $domain;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->domain = app(Domain::class);
        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
    }

    private function leaf(string $kind): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->store->id)->where('kind', $kind)->sole();
    }

    private function refused(string $message, callable $action): void
    {
        try {
            $action();
        } catch (MovementDomainException $e) {
            $this->assertStringContainsString($message, $e->getMessage());

            return;
        }

        $this->fail("Expected a refusal containing \"{$message}\".");
    }

    #[Test]
    public function a_place_that_does_not_exist_is_an_unknown_location(): void
    {
        foreach ([Store::class, StockLocation::class, ItemInventoryLocation::class, 'Some\\Other\\Model'] as $type) {
            $node = $this->domain->describe($type, 999999);

            $this->assertSame(Domain::NODE_OTHER, $node['kind'], $type);
            $this->assertSame('Unknown location', $node['name']);
            $this->assertNull($node['store_id']);
        }
    }

    #[Test]
    public function store_areas_and_tree_leaves_read_as_their_kind(): void
    {
        $shelfArea = $this->store->inventoryLocations()->shelves()->firstOrFail();

        $this->assertSame(Domain::NODE_SHELF, $this->domain->describe(ItemInventoryLocation::class, (int) $shelfArea->id)['kind']);
        $this->assertSame(Domain::NODE_BACKROOM, $this->domain->describe(StockLocation::class, (int) $this->leaf(StockLocation::KIND_BACKROOM)->id)['kind']);
        $this->assertSame(Domain::NODE_STORE, $this->domain->describe(Store::class, (int) $this->store->id)['kind']);

        $remote = app(StockLocationTree::class)->addRemoteHub($this->store);
        $this->assertSame(Domain::NODE_REMOTE_WAREHOUSE, $this->domain->describe(StockLocation::class, (int) $remote->id)['kind']);
        $this->assertSame(Domain::NODE_TRANSIT, $this->domain->describe(StockLocation::class, (int) app(StockLocationTree::class)->transit()->id)['kind']);

        $this->assertTrue($this->domain->isLocalized(Domain::NODE_SHELF));
        $this->assertFalse($this->domain->isLocalized(Domain::NODE_MAIN_WAREHOUSE));
    }

    #[Test]
    public function a_transfer_needs_two_different_places_and_never_ends_at_delivery(): void
    {
        $floor = $this->leaf(StockLocation::KIND_BACKROOM);
        $transit = app(StockLocationTree::class)->transit();

        $this->refused('two different locations', fn () => $this->domain->assertTransferLeg(StockLocation::class, (int) $floor->id, StockLocation::class, (int) $floor->id));
        $this->refused('In Delivery is where goods are', fn () => $this->domain->assertTransferLeg(StockLocation::class, (int) $floor->id, StockLocation::class, (int) $transit->id));
        $this->refused('In Delivery is where goods are', fn () => $this->domain->assertTransferLeg(StockLocation::class, (int) $transit->id, StockLocation::class, (int) $floor->id));

        $this->domain->assertTransferLeg(StockLocation::class, (int) $floor->id, StockLocation::class, (int) $this->leaf(StockLocation::KIND_SHELF)->id);
        $this->addToAssertionCount(1);
    }

    #[Test]
    public function a_delivery_must_leave_a_confirmed_place(): void
    {
        $this->refused('confirmed during Pick & Pack', fn () => $this->domain->assertDeliveryOrigin(null, null));
        $this->refused('confirmed during Pick & Pack', fn () => $this->domain->assertDeliveryOrigin(StockLocation::class, null));

        $this->domain->assertDeliveryOrigin(StockLocation::class, (int) $this->leaf(StockLocation::KIND_SHELF)->id);
        $this->addToAssertionCount(1);
    }

    #[Test]
    public function only_a_main_warehouse_source_makes_the_buyer_wait(): void
    {
        config(['inventory.delayed_promise' => 'Tomorrow', 'inventory.same_day_promise' => 'Today']);

        $this->assertSame(['delayed' => true, 'promise' => 'Tomorrow'], $this->domain->fulfilmentPromiseFor(Domain::NODE_MAIN_WAREHOUSE));
        $this->assertSame(['delayed' => false, 'promise' => 'Today'], $this->domain->fulfilmentPromiseFor(Domain::NODE_SHELF));
        $this->assertSame(['delayed' => false, 'promise' => 'Today'], $this->domain->fulfilmentPromiseFor(Domain::NODE_REMOTE_WAREHOUSE));
    }
}
