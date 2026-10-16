<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\Inventory\RefillEngine;
use App\Services\Inventory\RefillWorkflow;
use App\Services\Inventory\StockLocationTree;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The refusals in RefillEngine and RefillWorkflow: bad refill routes, a full
 * shelf or hub line, a Remote Hub with no line, and suggestions put on the
 * wrong shipment or handled twice.
 */
class RefillGuardsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $shelf;

    private StockLocation $floor;

    private StockLocation $remote;

    private StockLocation $hubA;

    private Item $item;

    private ItemVariant $variant;

    private User $manager;

    private RefillEngine $engine;

    private RefillWorkflow $workflow;

    private StockService $stock;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $this->floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        $this->remote = app(StockLocationTree::class)->addRemoteHub($this->store);
        $warehouse = Warehouse::create(['name' => 'Main Distribution Hub A', 'code' => 'WH-MAIN-01']);
        $this->hubA = StockLocation::query()->legacy(Warehouse::class, $warehouse->id)->sole();

        $this->item = Item::factory()->create(['product_name' => 'Bic Pen', 'status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $this->item->id]);
        ShelfItemBand::query()->create(['stock_location_id' => $this->shelf->id, 'item_id' => $this->item->id, 'max_units' => 50, 'refill_units' => 20, 'critical_units' => 10]);

        $this->manager = User::factory()->create(['role' => 'store_manager', 'store_id' => $this->store->id]);
        $this->manager->assignRole('store_manager');
        $this->manager->refresh();

        $this->engine = app(RefillEngine::class);
        $this->workflow = app(RefillWorkflow::class);
        $this->stock = app(StockService::class);
    }

    private function refused(string $message, callable $action): void
    {
        try {
            $action();
        } catch (InvalidArgumentException $e) {
            $this->assertStringContainsString($message, $e->getMessage());

            return;
        }

        $this->fail("Expected a refusal containing \"{$message}\".");
    }

    /** A shelf with nothing on the floor or at the Remote Hub, so it all goes to a shipment suggestion. */
    private function shipmentSuggestion(): RefillRequest
    {
        $this->engine->setRoute($this->store->id, $this->item, [ItemRefillRoute::SOURCE_SHIPMENT]);
        $this->engine->raise($this->shelf, $this->item, RefillRequest::ORIGIN_MANUAL);

        return RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_SHIPMENT)->sole();
    }

    // ---- Routes ------------------------------------------------------------

    #[Test]
    public function a_refill_route_needs_known_sources_each_once(): void
    {
        $this->refused('needs at least one source', fn () => $this->engine->setRoute($this->store->id, $this->item, []));
        $this->refused('may only use the store floor', fn () => $this->engine->setRoute($this->store->id, $this->item, ['teleporter']));
        $this->refused('may appear once', fn () => $this->engine->setRoute($this->store->id, $this->item, [ItemRefillRoute::SOURCE_FLOOR, ItemRefillRoute::SOURCE_FLOOR]));
    }

    // ---- Raising -----------------------------------------------------------

    #[Test]
    public function a_full_shelf_needs_nothing_even_when_asked_by_hand(): void
    {
        $this->stock->receive($this->variant->id, $this->shelf, 50);

        $outcome = $this->engine->raise($this->shelf, $this->item, RefillRequest::ORIGIN_MANUAL);

        $this->assertSame('not_needed', $outcome['result']);
        $this->assertSame('Bic Pen is already full.', $outcome['message']);
        $this->assertSame(0, RefillRequest::query()->count());
    }

    #[Test]
    public function only_a_shelf_or_a_remote_hub_raises_refills(): void
    {
        $this->refused('is not a Store Shelf', fn () => $this->engine->raise($this->floor, $this->item));
    }

    #[Test]
    public function a_remote_hub_without_a_line_for_the_item_cannot_restock_it(): void
    {
        $this->refused('has no line at', fn () => $this->engine->raise($this->remote, $this->item, RefillRequest::ORIGIN_MANUAL));
    }

    #[Test]
    public function a_remote_hub_line_says_when_it_is_full_or_already_coming(): void
    {
        ShelfItemBand::query()->create(['stock_location_id' => $this->remote->id, 'item_id' => $this->item->id, 'max_units' => 100, 'refill_units' => 40, 'critical_units' => 10]);

        $this->stock->receive($this->variant->id, $this->remote, 100);
        $full = $this->engine->raise($this->remote, $this->item, RefillRequest::ORIGIN_MANUAL);
        $this->assertSame(['not_needed', 'Bic Pen is already full at '.$this->remote->name.'.'], [$full['result'], $full['message']]);

        // Dropping below the refill line raises the hub's restock on its own (the stock observer).
        $this->stock->moveOut($this->variant->id, $this->remote, 70);
        $this->assertSame(1, RefillRequest::query()->where('target_location_id', $this->remote->id)->count());

        $again = $this->engine->raise($this->remote, $this->item, RefillRequest::ORIGIN_MANUAL);
        $this->assertSame('covered', $again['result']);
        $this->assertStringContainsString('already on its way', $again['message']);
    }

    // ---- Handling suggestions ---------------------------------------------

    #[Test]
    public function a_manifest_needs_real_suggestions_and_a_hub_to_floor_or_remote_hub_shipment(): void
    {
        $leg = $this->shipmentSuggestion();

        $this->refused('Pick at least one suggestion', fn () => $this->workflow->addToManifest(\App\Models\Fulfillment\Shipment::query()->make(), [], $this->manager));

        $shipment = $this->workflow->buildShipment($this->hubA, $this->floor, [$leg->id => null], $this->manager);
        $this->assertSame((int) $shipment->id, (int) $leg->fresh()->shipment_id);

        $this->refused('no longer exists', fn () => $this->workflow->addToManifest($shipment, [999999 => null], $this->manager));
        $this->refused('is not a suggestion waiting for you', fn () => $this->workflow->addToManifest($shipment, [$leg->id => null], $this->manager));
    }

    #[Test]
    public function a_refill_shipment_leaves_a_main_hub_for_a_floor_or_remote_hub(): void
    {
        $leg = $this->shipmentSuggestion();

        $this->refused('Shipments leave from Hub A or Hub B.', fn () => $this->workflow->buildShipment($this->remote, $this->floor, [$leg->id => null], $this->manager));
        $this->refused('goes to a store floor or a Remote Hub', fn () => $this->workflow->buildShipment($this->hubA, $this->shelf, [$leg->id => null], $this->manager));
        $this->assertSame(RefillRequest::STATUS_PENDING, $leg->fresh()->status);
    }

    #[Test]
    public function a_suggestion_for_another_store_cannot_go_on_this_shipment(): void
    {
        $leg = $this->shipmentSuggestion();
        $other = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $otherFloor = StockLocation::query()->where('store_id', $other->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();

        $this->refused('is for another store', fn () => $this->workflow->buildShipment($this->hubA, $otherFloor, [$leg->id => null], $this->manager));
    }

    #[Test]
    public function quantities_must_be_whole_and_a_settled_leg_cannot_be_handled_again(): void
    {
        $leg = $this->shipmentSuggestion();

        $this->refused('at least one', fn () => $this->workflow->updateQuantity($leg, 0));
        $this->refused('is already pending', fn () => $this->workflow->accept($leg, $this->manager));

        $this->workflow->cancel($leg, $this->manager, 'not needed');
        $this->assertSame(RefillRequest::STATUS_CANCELLED, $leg->fresh()->status);
        $this->refused('is already cancelled', fn () => $this->workflow->cancel($leg->fresh(), $this->manager));
    }

    #[Test]
    public function a_floor_refill_never_waits_for_a_manager(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 10);
        $this->engine->raise($this->shelf, $this->item, RefillRequest::ORIGIN_MANUAL);
        $floorLeg = RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_FLOOR)->first();

        $this->assertNotNull($floorLeg);
        $floorLeg->forceFill(['status' => RefillRequest::STATUS_PENDING])->save();
        $this->refused('never waits for a manager', fn () => $this->workflow->addToRemoteList($floorLeg->fresh(), $this->manager));
    }
}
