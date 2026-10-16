<?php

declare(strict_types=1);

namespace Tests\Feature\StockKeeper;

use App\Models\Auth\User;
use App\Models\Inventory\FloorArea;
use App\Models\Inventory\ReceiptDiscrepancy;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Stocktake;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\StockLocationTree;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Receiving with discrepancies, stocktakes, the floor plan and the scanner.
 *
 * Throughout, stock is conserved: every unit is at a place, In Delivery, or
 * written off through the journal.
 */
class WarehouseFeaturesTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Item $item;

    private ItemVariant $variant;

    private StockLocation $shelf;

    private StockLocation $floor;

    private StockService $stock;

    private User $keeper;

    private User $colleague;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['stock_keeper', 'admin', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->stock = app(StockService::class);
        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->shelf = $this->leaf(StockLocation::KIND_SHELF);
        $this->floor = $this->leaf(StockLocation::KIND_BACKROOM);

        $this->item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $this->item->id, 'barcode' => '6291041500213']);
        StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $this->item->id, 'item_variant_id' => $this->variant->id, 'active' => true]);
        ShelfItemBand::query()->create(['stock_location_id' => $this->shelf->id, 'item_id' => $this->item->id, 'max_units' => 100, 'refill_units' => 10, 'critical_units' => 5]);
        $this->stock->receive((int) $this->variant->id, $this->floor, 40);

        $this->keeper = $this->keeper();
        $this->colleague = $this->keeper();

        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.'.config('app.system_domain')]);
        $this->actingAs($this->keeper);
    }

    private function keeper(): User
    {
        $user = User::factory()->create(['role' => 'stock_keeper']);
        $user->assignRole('stock_keeper');

        return $user->refresh();
    }

    private function leaf(string $kind): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->store->id)->where('kind', $kind)->sole();
    }

    private function at(StockLocation $leaf): int
    {
        return (int) ItemStock::query()->where('item_variant_id', $this->variant->id)->where('stock_location_id', $leaf->id)->sum('quantity');
    }

    private function inDelivery(): int
    {
        return $this->at(app(StockLocationTree::class)->transit());
    }

    /** Raise and dispatch 12 from the floor to the shelf. */
    private function sendTwelve(): Transfer
    {
        $this->post(route('stock_keeper.transfers.store'), [
            'item_variant_id' => $this->variant->id,
            'quantity' => 12,
            'source_location_type' => StockLocation::class,
            'source_location_id' => $this->floor->id,
            'destination_location_type' => StockLocation::class,
            'destination_location_id' => $this->shelf->id,
        ]);
        $transfer = Transfer::query()->latest('id')->firstOrFail();
        $this->post(route('stock_keeper.transfers.dispatch', $transfer));

        return $transfer->refresh();
    }

    // ---- Receiving ---------------------------------------------------------

    #[Test]
    public function a_transfer_taken_in_without_a_count_lands_in_full(): void
    {
        $transfer = $this->sendTwelve();
        $this->post(route('stock_keeper.transfers.complete', $transfer))->assertSessionHas('success');

        $this->assertSame([28, 12, 0], [$this->at($this->floor), $this->at($this->shelf), $this->inDelivery()]);
        $this->assertSame(0, ReceiptDiscrepancy::query()->count());
    }

    #[Test]
    public function a_short_and_damaged_arrival_lands_what_came_and_logs_the_rest(): void
    {
        $transfer = $this->sendTwelve();
        $this->post(route('stock_keeper.transfers.complete', $transfer), ['received' => 9, 'damaged' => 2])->assertSessionHas('success');

        // 9 arrived, 2 of them broken and written off: 7 on the shelf; 3 still with the courier.
        $this->assertSame([28, 7, 3], [$this->at($this->floor), $this->at($this->shelf), $this->inDelivery()]);

        $short = ReceiptDiscrepancy::query()->where('kind', ReceiptDiscrepancy::SHORT)->sole();
        $this->assertSame([3, 'open'], [$short->quantity, $short->status]);
        $damaged = ReceiptDiscrepancy::query()->where('kind', ReceiptDiscrepancy::DAMAGED)->sole();
        $this->assertSame([2, 'resolved', 'written_off'], [$damaged->quantity, $damaged->status, $damaged->resolution]);
    }

    #[Test]
    public function the_receiver_cannot_settle_their_own_shortfall_but_a_colleague_can(): void
    {
        $this->post(route('stock_keeper.transfers.complete', $this->sendTwelve()), ['received' => 9]);
        $short = ReceiptDiscrepancy::query()->sole();

        $this->post(route('stock_keeper.receiving.resolve', $short), ['resolution' => 'found'])->assertSessionHas('error');
        $this->assertSame('open', $short->fresh()->status);

        $this->actingAs($this->colleague)
            ->post(route('stock_keeper.receiving.resolve', $short), ['resolution' => 'found'])
            ->assertSessionHas('success');

        $this->assertSame([12, 0], [$this->at($this->shelf), $this->inDelivery()]);
        $this->assertSame('found', $short->fresh()->resolution);
    }

    #[Test]
    public function a_shortfall_is_settled_once_and_only_as_found_or_lost(): void
    {
        $this->post(route('stock_keeper.transfers.complete', $this->sendTwelve()), ['received' => 9]);
        $short = ReceiptDiscrepancy::query()->sole();

        $response = $this->actingAs($this->colleague)->post(route('stock_keeper.receiving.resolve', $short), ['resolution' => 'accepted']);
        $this->assertTrue($response->getSession()->has('errors') || $response->getSession()->has('error'), 'a shortfall is not "accepted"');
        $this->assertSame('open', $short->fresh()->status);

        $this->actingAs($this->colleague)->post(route('stock_keeper.receiving.resolve', $short), ['resolution' => 'lost'])->assertSessionHas('success');
        $this->actingAs($this->colleague)->post(route('stock_keeper.receiving.resolve', $short->fresh()), ['resolution' => 'found'])
            ->assertSessionHas('error', "{$short->reference} is already settled.");
        $this->assertSame('lost', $short->fresh()->resolution);
    }

    #[Test]
    public function a_lost_shortfall_is_written_off_from_the_couriers_custody(): void
    {
        $this->post(route('stock_keeper.transfers.complete', $this->sendTwelve()), ['received' => 10]);

        $this->actingAs($this->colleague)
            ->post(route('stock_keeper.receiving.resolve', ReceiptDiscrepancy::query()->sole()), ['resolution' => 'lost']);

        $this->assertSame([28, 10, 0], [$this->at($this->floor), $this->at($this->shelf), $this->inDelivery()]);
    }

    #[Test]
    public function an_over_delivery_books_the_extra_in_and_asks_for_review(): void
    {
        $this->post(route('stock_keeper.transfers.complete', $this->sendTwelve()), ['received' => 14]);

        $this->assertSame([14, 0], [$this->at($this->shelf), $this->inDelivery()]);
        $over = ReceiptDiscrepancy::query()->sole();
        $this->assertSame([ReceiptDiscrepancy::OVER, 2, 'open'], [$over->kind, $over->quantity, $over->status]);

        $this->get(route('stock_keeper.receiving.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('StockKeeper/Receiving/index')->where('counts.open', 1)->where('counts.over', 1));
    }

    #[Test]
    public function damaged_cannot_be_more_than_arrived(): void
    {
        $transfer = $this->sendTwelve();
        $this->post(route('stock_keeper.transfers.complete', $transfer), ['received' => 3, 'damaged' => 5])->assertSessionHasErrors('damaged');

        $this->assertSame('in_transit', $transfer->fresh()->status);
    }

    // ---- Stocktake ---------------------------------------------------------

    #[Test]
    public function a_count_is_booked_only_after_someone_else_approves_it(): void
    {
        $this->post(route('stock_keeper.stocktakes.store'), ['stock_location_id' => $this->floor->id])->assertRedirect();
        $take = Stocktake::query()->sole();
        $this->assertSame(40, (int) $take->lines()->sole()->expected);

        $this->post(route('stock_keeper.stocktakes.count', $take), ['item_variant_id' => $this->variant->id, 'counted' => 37]);
        $this->post(route('stock_keeper.stocktakes.submit', $take))->assertSessionHas('success');

        // The submitter cannot approve their own count.
        $this->post(route('stock_keeper.stocktakes.post', $take))->assertSessionHas('error');
        $this->assertSame(40, $this->at($this->floor));

        $this->actingAs($this->colleague)->post(route('stock_keeper.stocktakes.post', $take))->assertSessionHas('success');
        $this->assertSame([37, 'posted'], [$this->at($this->floor), $take->fresh()->status]);
    }

    #[Test]
    public function in_a_one_keeper_store_the_store_manager_approves_the_count_in_admin(): void
    {
        $this->post(route('stock_keeper.stocktakes.store'), ['stock_location_id' => $this->floor->id]);
        $take = Stocktake::query()->sole();
        $this->post(route('stock_keeper.stocktakes.count', $take), ['item_variant_id' => $this->variant->id, 'counted' => 36]);
        $this->post(route('stock_keeper.stocktakes.submit', $take));

        $manager = User::factory()->create(['role' => 'store_manager', 'store_id' => $this->store->id]);
        $manager->assignRole('store_manager');
        $elsewhere = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $otherManager = User::factory()->create(['role' => 'store_manager', 'store_id' => $elsewhere->id]);
        $otherManager->assignRole('store_manager');

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);

        // Another store's manager neither sees it nor approves it.
        $this->actingAs($otherManager->refresh())->get(route('admin.inventory.counts.index'))
            ->assertOk()->assertInertia(fn (Assert $page) => $page->component('Admin/Inventory/Counts/Index')->has('counts', 0));
        $this->post(route('admin.inventory.counts.approve', $take))->assertNotFound();
        $this->assertSame(40, $this->at($this->floor));

        $this->actingAs($manager->refresh())->get(route('admin.inventory.counts.index'))
            ->assertOk()->assertInertia(fn (Assert $page) => $page->has('counts', 1)->where('counts.0.reference', $take->reference)->where('counts.0.can_approve', true));
        $this->post(route('admin.inventory.counts.approve', $take))->assertSessionHas('success');

        $this->assertSame([36, 'posted', $manager->id], [$this->at($this->floor), $take->fresh()->status, (int) $take->fresh()->approved_by]);
    }

    #[Test]
    public function stock_moved_during_a_count_is_kept(): void
    {
        $this->post(route('stock_keeper.stocktakes.store'), ['stock_location_id' => $this->floor->id]);
        $take = Stocktake::query()->sole();

        // 5 more arrive mid-count; the count still says 2 short of the snapshot.
        $this->stock->receive((int) $this->variant->id, $this->floor, 5);
        $this->post(route('stock_keeper.stocktakes.count', $take), ['item_variant_id' => $this->variant->id, 'counted' => 38]);
        $this->post(route('stock_keeper.stocktakes.submit', $take));
        $this->actingAs($this->colleague)->post(route('stock_keeper.stocktakes.post', $take));

        $this->assertSame(43, $this->at($this->floor));
    }

    #[Test]
    public function a_scanned_barcode_counts_an_item_the_ledger_did_not_expect(): void
    {
        $other = ItemVariant::factory()->create(['item_id' => $this->item->id, 'barcode' => 'EXTRA-001']);

        $this->post(route('stock_keeper.stocktakes.store'), ['stock_location_id' => $this->floor->id]);
        $take = Stocktake::query()->sole();
        $this->post(route('stock_keeper.stocktakes.count', $take), ['code' => 'EXTRA-001', 'counted' => 4]);

        $line = $take->lines()->where('item_variant_id', $other->id)->sole();
        $this->assertSame([0, 4], [(int) $line->expected, (int) $line->counted]);

        $this->get(route('stock_keeper.stocktakes.show', $take))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('StockKeeper/Stocktakes/Show')->where('stocktake.totals.lines', 2)->where('stocktake.totals.over', 1));
    }

    #[Test]
    public function only_one_count_is_open_per_place(): void
    {
        $this->post(route('stock_keeper.stocktakes.store'), ['stock_location_id' => $this->floor->id]);
        $this->post(route('stock_keeper.stocktakes.store'), ['stock_location_id' => $this->floor->id])->assertSessionHas('error');

        $this->assertSame(1, Stocktake::query()->count());
    }

    // ---- Floor plan --------------------------------------------------------

    #[Test]
    public function a_floor_gets_a_size_areas_and_items(): void
    {
        $this->put(route('stock_keeper.floor.size', $this->floor), ['width' => 10, 'length' => 30])->assertSessionHasNoErrors();
        $this->post(route('stock_keeper.floor.areas.store', $this->floor), ['code' => 'a1', 'kind' => 'pallet', 'x' => 0, 'y' => 0, 'width' => 5, 'length' => 5])->assertSessionHasNoErrors();
        $area = FloorArea::query()->sole();
        $this->assertSame('A1', $area->code);

        // Overlapping, or running off the floor, is refused.
        $this->post(route('stock_keeper.floor.areas.store', $this->floor), ['code' => 'B1', 'x' => 4, 'y' => 4, 'width' => 3, 'length' => 3])->assertSessionHasErrors('floor');
        $this->post(route('stock_keeper.floor.areas.store', $this->floor), ['code' => 'B2', 'x' => 8, 'y' => 0, 'width' => 5, 'length' => 3])->assertSessionHasErrors('floor');

        $this->post(route('stock_keeper.floor.areas.place', [$this->floor, $area]), ['item_id' => $this->item->id])->assertSessionHasNoErrors();

        $this->get(route('stock_keeper.floor.index', ['location' => $this->floor->id]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('StockKeeper/Floor/index')
                ->where('plan.floor.area_m2', 300)
                ->where('plan.areas.0.code', 'A1')
                ->where('plan.areas.0.items.0.item_id', $this->item->id)
                ->where('plan.unplaced', []));

        $this->get(route('stock_keeper.levels.index', ['location' => $this->floor->id]))
            ->assertInertia(fn (Assert $page) => $page->where('board.items.0.areas', ['A1']));

        // A floor cannot shrink under an area.
        $this->put(route('stock_keeper.floor.size', $this->floor), ['width' => 4, 'length' => 30])->assertSessionHasErrors('floor');
    }

    // ---- Scanner and item page ----------------------------------------------

    #[Test]
    public function a_scanned_barcode_opens_its_item_without_prices(): void
    {
        $this->get(route('stock_keeper.scan', ['code' => '6291041500213']))
            ->assertRedirect(route('stock_keeper.items.show', ['item' => $this->item->id, 'variant' => $this->variant->id]));

        $this->get(route('stock_keeper.items.show', ['item' => $this->item->id, 'variant' => $this->variant->id]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('StockKeeper/Items/Show')
                ->where('item.variants.0.barcode', '6291041500213')
                ->where('scanned_variant', $this->variant->id)
                ->missing('item.price')
                ->missing('item.variants.0.price'));
    }

    #[Test]
    public function an_unknown_code_says_so(): void
    {
        $this->from(route('stock_keeper.dashboard'))
            ->get(route('stock_keeper.scan', ['code' => 'NOPE']))
            ->assertRedirect(route('stock_keeper.dashboard'))
            ->assertSessionHas('error');
    }
}
