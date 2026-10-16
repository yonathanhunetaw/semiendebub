<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Exceptions\InsufficientStockException;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Services\Inventory\StockLocationTree;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The refusals that keep item_stocks honest: no zero or negative movements,
 * no move onto the same place, no hold or pick beyond what is there, and
 * Delivery (transit) is never named as an origin or destination.
 */
class StockLedgerGuardsTest extends TestCase
{
    use RefreshDatabase;

    private StockService $stock;

    private Store $store;

    private StockLocation $floor;

    private StockLocation $shelf;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->stock = app(StockService::class);
        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $this->floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $this->variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]);

        $this->stock->receive($this->variant->id, $this->floor, 10);
    }

    private function onFloor(): int
    {
        return (int) ItemStock::query()->where('item_variant_id', $this->variant->id)->where('stock_location_id', $this->floor->id)->sum('quantity');
    }

    private function assertRefused(string $message, callable $action): void
    {
        try {
            $action();
        } catch (InvalidArgumentException|InsufficientStockException $e) {
            $this->assertStringContainsString($message, $e->getMessage());
            $this->assertSame(10, $this->onFloor(), 'a refused movement moves nothing');

            return;
        }

        $this->fail("Expected a refusal containing \"{$message}\".");
    }

    #[Test]
    public function quantities_must_be_positive(): void
    {
        $this->assertRefused('greater than zero', fn () => $this->stock->receive($this->variant->id, $this->floor, 0));
        $this->assertRefused('greater than zero', fn () => $this->stock->moveOut($this->variant->id, $this->floor, -3));
        $this->assertRefused('greater than zero', fn () => $this->stock->move($this->variant->id, $this->floor, $this->shelf, 0));
        $this->assertRefused('greater than zero', fn () => $this->stock->reserve($this->variant->id, $this->store, 0));
    }

    #[Test]
    public function an_adjustment_of_nothing_is_refused(): void
    {
        $this->assertRefused('must change the quantity', fn () => $this->stock->adjust($this->variant->id, $this->floor, 0));
    }

    #[Test]
    public function a_move_needs_two_different_places(): void
    {
        $this->assertRefused('two different locations', fn () => $this->stock->move($this->variant->id, $this->floor, $this->floor, 1));
    }

    #[Test]
    public function an_unknown_variant_is_refused(): void
    {
        $this->assertRefused('Unknown item variant', fn () => $this->stock->receive(999999, $this->floor, 1));
    }

    #[Test]
    public function delivery_is_never_named_as_a_place(): void
    {
        $transit = app(StockLocationTree::class)->transit();

        $this->assertRefused('not Delivery itself', fn () => $this->stock->receive($this->variant->id, $transit, 1));
    }

    #[Test]
    public function a_hold_at_one_place_cannot_exceed_what_is_free_there(): void
    {
        $this->assertRefused('', fn () => $this->stock->reserveAt($this->variant->id, $this->floor, $this->store, 11));

        $hold = $this->stock->reserveAt($this->variant->id, $this->floor, $this->store, 7);
        $this->assertSame(3, $this->stock->availableAt($this->variant->id, $this->floor));
        $this->assertSame((int) $this->floor->id, (int) $hold->stock_location_id);

        // The 7 held are not free for a second hold.
        $this->assertRefused('', fn () => $this->stock->reserveAt($this->variant->id, $this->floor, $this->store, 4));
    }

    #[Test]
    public function a_pick_cannot_exceed_its_hold_or_use_a_closed_one(): void
    {
        $hold = $this->stock->reserveAt($this->variant->id, $this->floor, $this->store, 4);

        $this->assertRefused('holds 4', fn () => $this->stock->pick($hold, $this->floor, 5));

        $this->stock->release($hold);
        $this->assertRefused('not open', fn () => $this->stock->pick($hold->fresh(), $this->floor, 1));
    }

    #[Test]
    public function moving_out_more_than_is_there_is_refused(): void
    {
        $this->assertRefused('', fn () => $this->stock->moveOut($this->variant->id, $this->floor, 11));
    }
}
