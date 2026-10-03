<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Exceptions\InsufficientStockException;
use App\Models\Inventory\InventoryMovement;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\StockReservation;
use App\Models\Inventory\Warehouse;
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
 * STOCK_PLAN.md phase 3: the ledger gateway and reservations.
 *
 * Covers acceptance tests 1 (conservation), 3 (never negative, never clamped)
 * and 5 (stock only at stockable locations) at the gateway level; the
 * checkout-level oversell test lands with the phase-4 cutover.
 */
class StockGatewayTest extends TestCase
{
    use RefreshDatabase;

    private StockService $stock;

    private Store $store;

    private StockLocation $shelf;

    private StockLocation $floor;

    private StockLocation $hub;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->stock = app(StockService::class);
        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $this->shelf = $this->leaf(StockLocation::KIND_SHELF);
        $this->floor = $this->leaf(StockLocation::KIND_BACKROOM);
        $warehouse = Warehouse::create(['name' => 'Main Distribution Hub A', 'code' => 'WH-MAIN-01']);
        $this->hub = StockLocation::query()->legacy(Warehouse::class, $warehouse->id)->sole();
        $this->variant = ItemVariant::factory()->create();
    }

    #[Test]
    public function receive_books_onto_the_leaf_and_journals_the_balance(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 30, ['reason' => 'Vendor delivery']);
        $row = $this->stock->receive($this->variant->id, $this->floor, 5);

        $this->assertSame(35, $row->quantity);
        $this->assertSame($this->floor->id, $row->stock_location_id);
        // Readers still on the morph columns see it as store-level stock.
        $this->assertSame([Store::class, $this->store->id], [$row->location_type, (int) $row->location_id]);

        $journal = InventoryMovement::query()->orderBy('id')->get();
        $this->assertSame(['receive', 'receive'], $journal->pluck('type')->all());
        $this->assertSame([30, 5], $journal->pluck('quantity')->all());
        $this->assertSame([30, 35], $journal->pluck('balance_after')->all());
        $this->assertSame('Vendor delivery', $journal->first()->reason);
    }

    #[Test]
    public function a_debit_past_zero_is_refused_not_clamped_and_changes_nothing(): void
    {
        $this->stock->receive($this->variant->id, $this->shelf, 4);

        try {
            $this->stock->moveOut($this->variant->id, $this->shelf, 5);
            $this->fail('Debit past zero was allowed.');
        } catch (InsufficientStockException $e) {
            $this->assertSame(5, $e->getRequestedQuantity());
            $this->assertSame(4, $e->getAvailableStock());
        }

        $this->assertSame(4, $this->quantityAt($this->shelf));
        $this->assertSame(1, InventoryMovement::query()->count());

        $this->expectException(InsufficientStockException::class);
        $this->stock->adjust($this->variant->id, $this->shelf, -5);
    }

    #[Test]
    public function moves_conserve_the_variant_total(): void
    {
        $this->stock->receive($this->variant->id, $this->hub, 100);
        $this->stock->receive($this->variant->id, $this->floor, 20);

        $this->stock->move($this->variant->id, $this->hub, $this->floor, 40);
        $this->stock->move($this->variant->id, $this->floor, $this->shelf, 15);
        $this->stock->moveOut($this->variant->id, $this->floor, 10);
        $this->stock->moveIn($this->variant->id, $this->hub, 10);

        $this->assertSame(120, (int) ItemStock::query()->where('item_variant_id', $this->variant->id)->sum('quantity'));
        $this->assertSame([70, 35, 15], [
            $this->quantityAt($this->hub), $this->quantityAt($this->floor), $this->quantityAt($this->shelf),
        ]);

        // The journal replays to the same balances.
        foreach ([$this->hub, $this->floor, $this->shelf] as $leaf) {
            $this->assertSame($this->quantityAt($leaf), (int) InventoryMovement::query()
                ->where('stock_location_id', $leaf->id)
                ->whereNotIn('type', ['reserve', 'release'])
                ->sum('quantity'));
        }
    }

    #[Test]
    public function stock_is_never_booked_on_a_store_group_node(): void
    {
        $node = StockLocation::query()->legacy(Store::class, $this->store->id)->sole();

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('not a stockable location');

        $this->stock->receive($this->variant->id, $node, 1);
    }

    #[Test]
    public function a_remote_hub_without_a_legacy_twin_keeps_its_own_address(): void
    {
        $remote = app(StockLocationTree::class)->addRemoteHub($this->store);

        $row = $this->stock->receive($this->variant->id, $remote, 9);

        $this->assertSame($remote->id, $row->stock_location_id);
        $this->assertSame([StockLocation::class, $remote->id], [$row->location_type, (int) $row->location_id]);
    }

    #[Test]
    public function reservations_stop_the_last_unit_being_sold_twice(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 2);
        $this->stock->receive($this->variant->id, $this->shelf, 1);

        $this->stock->reserve($this->variant->id, $this->store, 2);
        $this->stock->reserve($this->variant->id, $this->store, 1);

        $this->assertSame(3, $this->stock->onHandAtStore($this->variant->id, $this->store->id));
        $this->assertSame(0, $this->stock->availableAtStore($this->variant->id, $this->store->id));

        $this->expectException(InsufficientStockException::class);
        $this->stock->reserve($this->variant->id, $this->store, 1);
    }

    #[Test]
    public function hub_stock_does_not_count_as_sellable_at_the_store(): void
    {
        $this->stock->receive($this->variant->id, $this->hub, 50);

        $this->expectException(InsufficientStockException::class);
        $this->stock->reserve($this->variant->id, $this->store, 1);
    }

    #[Test]
    public function release_frees_the_units_and_is_idempotent(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 3);
        $reservation = $this->stock->reserve($this->variant->id, $this->store, 3);

        $this->stock->release($reservation);
        $again = $this->stock->release($reservation);

        $this->assertSame(StockReservation::STATUS_RELEASED, $again->status);
        $this->assertSame(3, $this->stock->availableAtStore($this->variant->id, $this->store->id));
        $this->assertSame(1, InventoryMovement::query()->where('type', 'release')->count());
    }

    #[Test]
    public function pick_debits_the_confirmed_leaf_and_closes_the_reservation(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 5);
        $this->stock->receive($this->variant->id, $this->shelf, 5);
        $reservation = $this->stock->reserve($this->variant->id, $this->store, 4);

        $this->stock->pick($reservation, $this->shelf);

        $reservation->refresh();
        $this->assertSame(StockReservation::STATUS_PICKED, $reservation->status);
        $this->assertSame($this->shelf->id, $reservation->picked_stock_location_id);
        $this->assertSame(1, $this->quantityAt($this->shelf));
        $this->assertSame(5, $this->quantityAt($this->floor));
        $this->assertSame(6, $this->stock->availableAtStore($this->variant->id, $this->store->id));

        $this->expectException(InvalidArgumentException::class);
        $this->stock->pick($reservation, $this->shelf);
    }

    #[Test]
    public function a_short_pick_frees_the_remainder(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 10);
        $reservation = $this->stock->reserve($this->variant->id, $this->store, 6);

        $this->stock->pick($reservation, $this->floor, 4);

        $this->assertSame(4, $reservation->fresh()->quantity);
        $this->assertSame(6, $this->quantityAt($this->floor));
        $this->assertSame(6, $this->stock->availableAtStore($this->variant->id, $this->store->id));
    }

    #[Test]
    public function a_pick_the_leaf_cannot_cover_fails_and_leaves_the_reservation_open(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 5);
        $reservation = $this->stock->reserve($this->variant->id, $this->store, 3);

        try {
            $this->stock->pick($reservation, $this->shelf);
            $this->fail('Picked from an empty shelf.');
        } catch (InsufficientStockException) {
        }

        $this->assertTrue($reservation->fresh()->isOpen());
        $this->assertSame(5, $this->quantityAt($this->floor));
    }

    #[Test]
    public function expired_reservations_are_released_by_the_sweep(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 4);
        $this->stock->reserve($this->variant->id, $this->store, 2, ['expires_at' => now()->subMinute()]);
        $this->stock->reserve($this->variant->id, $this->store, 1, ['expires_at' => now()->addHour()]);

        $this->artisan('stock:release-stale-reservations')->assertSuccessful();

        $this->assertSame(1, StockReservation::query()->open()->count());
        $this->assertSame(3, $this->stock->availableAtStore($this->variant->id, $this->store->id));
    }

    private function leaf(string $kind): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->store->id)->where('kind', $kind)->sole();
    }

    private function quantityAt(StockLocation $leaf): int
    {
        return (int) ItemStock::query()
            ->where('item_variant_id', $this->variant->id)
            ->where('stock_location_id', $leaf->id)
            ->value('quantity');
    }
}
