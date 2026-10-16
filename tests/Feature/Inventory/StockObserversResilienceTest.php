<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\RefillEngine;
use App\Services\Inventory\ReplenishmentProposalService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The stock observers react to every item_stocks write, but a refill or a
 * replenishment proposal is advisory: if raising one fails, the stock movement
 * still stands and the failure is only logged. They also stay quiet when
 * switched off.
 */
class StockObserversResilienceTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $shelf;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $item->id, 'item_variant_id' => $this->variant->id]);
        ShelfItemBand::query()->create(['stock_location_id' => $this->shelf->id, 'item_id' => $item->id, 'max_units' => 50, 'refill_units' => 20, 'critical_units' => 10]);
    }

    private function onShelf(): int
    {
        return (int) ItemStock::query()->where('item_variant_id', $this->variant->id)->where('stock_location_id', $this->shelf->id)->sum('quantity');
    }

    #[Test]
    public function a_failing_shelf_refill_never_undoes_the_stock_movement(): void
    {
        $this->mock(RefillEngine::class)->shouldReceive('raise')->andThrow(new \RuntimeException('engine down'));
        Log::spy();

        app(StockService::class)->receive($this->variant->id, $this->shelf, 5);

        $this->assertSame(5, $this->onShelf());
        Log::shouldHaveReceived('warning')->withArgs(fn ($message) => $message === 'Automatic shelf refill failed after a stock change');
    }

    #[Test]
    public function a_failing_replenishment_review_never_undoes_the_stock_movement(): void
    {
        $this->mock(ReplenishmentProposalService::class)->shouldReceive('sweep')->andThrow(new \RuntimeException('planner down'));
        Log::spy();

        app(StockService::class)->receive($this->variant->id, $this->shelf, 5);
        app(StockService::class)->moveOut($this->variant->id, $this->shelf, 2);

        $this->assertSame(3, $this->onShelf());
        Log::shouldHaveReceived('warning')->withArgs(fn ($message) => $message === 'Replenishment review failed after a stock change');
    }

    #[Test]
    public function switched_off_observers_raise_nothing(): void
    {
        config(['inventory.shelf_refill.observe_stock_changes' => false, 'inventory.auto_replenishment.enabled' => false]);
        $planner = $this->mock(ReplenishmentProposalService::class);
        $planner->shouldNotReceive('sweep');

        app(StockService::class)->receive($this->variant->id, $this->shelf, 5);

        $this->assertSame(0, RefillRequest::query()->count());
    }

    #[Test]
    public function stock_in_a_place_without_a_bin_raises_no_refill(): void
    {
        $engine = $this->mock(RefillEngine::class);
        $engine->shouldNotReceive('raise');

        $floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        app(StockService::class)->receive($this->variant->id, $floor, 5);

        $other = ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]);
        app(StockService::class)->receive($other->id, $this->shelf, 5);

        $this->addToAssertionCount(1);
    }

    #[Test]
    public function a_deleted_stock_row_is_reviewed_too(): void
    {
        app(StockService::class)->receive($this->variant->id, $this->shelf, 5);
        $planner = $this->mock(ReplenishmentProposalService::class);
        $planner->shouldReceive('sweep')->once();

        ItemStock::query()->where('item_variant_id', $this->variant->id)->where('stock_location_id', $this->shelf->id)->sole()->delete();
    }

    #[Test]
    public function a_refill_leg_that_cannot_follow_its_carrier_never_blocks_the_carrier(): void
    {
        $workflow = $this->mock(\App\Services\Inventory\RefillWorkflow::class);
        $workflow->shouldReceive('transferMoved')->andThrow(new \RuntimeException('legs broken'));
        $workflow->shouldReceive('shipmentMoved')->andThrow(new \RuntimeException('legs broken'));
        $workflow->shouldReceive('manifestLineRemoved')->andThrow(new \RuntimeException('legs broken'));
        Log::spy();

        $hub = Store::factory()->create(['type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $depot = Store::factory()->create(['type' => Store::TYPE_REMOTE_WAREHOUSE]);
        $shipments = app(\App\Services\ShipmentWorkflowService::class);
        $shipment = $shipments->create($hub->id, $depot->id, ['scheduled_for' => '2026-11-02T08:30']);
        $line = $shipments->addItem($shipment->fresh(), $this->variant, 3);

        $line->delete();
        $shipment->fresh()->update(['status' => 'cancelled']);

        $this->assertModelMissing($line);
        $this->assertSame('cancelled', $shipment->fresh()->status);
        Log::shouldHaveReceived('warning')->withArgs(fn ($message) => $message === 'Refill suggestions could not follow a removed manifest line');
        Log::shouldHaveReceived('warning')->withArgs(fn ($message) => $message === 'Refill legs could not follow their carrier');
    }
}
