<?php

declare(strict_types=1);

namespace Tests\Feature\StockKeeper;

use App\Models\Auth\User;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\StockLocationTree;
use App\Services\StockService;
use App\Services\TransferWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Stock Keeper app: receive and recount rules, the transfer queue (cancel,
 * validation, filters), the stock alerts list, the variant picker and the
 * guest welcome page.
 */
class StockKeeperWritePathsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Item $item;

    private ItemVariant $variant;

    private StockLocation $shelf;

    private StockLocation $floor;

    private StockService $stock;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['stock_keeper', 'admin'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->stock = app(StockService::class);
        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->shelf = $this->leaf(StockLocation::KIND_SHELF);
        $this->floor = $this->leaf(StockLocation::KIND_BACKROOM);

        $this->item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $this->item->id]);
        StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $this->item->id, 'item_variant_id' => $this->variant->id, 'active' => true]);
        ShelfItemBand::query()->create(['stock_location_id' => $this->shelf->id, 'item_id' => $this->item->id, 'max_units' => 100, 'refill_units' => 10, 'critical_units' => 5]);

        $keeper = User::factory()->create(['role' => 'stock_keeper']);
        $keeper->assignRole('stock_keeper');

        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.'.config('app.system_domain')]);
        $this->actingAs($keeper->refresh());
    }

    private function leaf(string $kind): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->store->id)->where('kind', $kind)->sole();
    }

    private function quantityAt(StockLocation $leaf): int
    {
        return (int) ItemStock::query()->where('item_variant_id', $this->variant->id)->where('stock_location_id', $leaf->id)->sum('quantity');
    }

    private function row(StockLocation $leaf): ItemStock
    {
        return ItemStock::query()->where('item_variant_id', $this->variant->id)->where('stock_location_id', $leaf->id)->firstOrFail();
    }

    // ---- Receiving ---------------------------------------------------------

    private function receive(array $overrides = [])
    {
        return $this->post(route('stock_keeper.inventory.receive'), $overrides + [
            'item_variant_id' => $this->variant->id,
            'location_type' => StockLocation::class,
            'location_id' => $this->floor->id,
            'quantity' => 10,
        ]);
    }

    #[Test]
    public function receiving_adds_to_the_count_and_says_how_many_are_now_on_hand(): void
    {
        $this->receive(['quantity' => 10])->assertSessionHasNoErrors();
        $this->receive(['quantity' => 5])->assertSessionHas('success', 'Received 5 units — 15 now on hand.');

        $this->assertSame(15, $this->quantityAt($this->floor));
    }

    #[Test]
    public function receiving_may_set_the_low_stock_line(): void
    {
        $this->receive(['quantity' => 10, 'min_stock_level' => 4])->assertSessionHasNoErrors();

        $this->assertSame(4, (int) $this->row($this->floor)->min_stock_level);
    }

    #[Test]
    public function receiving_needs_a_real_variant_a_known_location_kind_and_a_positive_quantity(): void
    {
        $this->receive(['item_variant_id' => 999999])->assertSessionHasErrors('item_variant_id');
        $this->receive(['location_type' => 'App\\Models\\User'])->assertSessionHasErrors('location_type');
        $this->receive(['quantity' => 0])->assertSessionHasErrors('quantity');
        $this->receive(['quantity' => 1000001])->assertSessionHasErrors('quantity');
        $this->receive(['min_stock_level' => -1])->assertSessionHasErrors('min_stock_level');
        $this->receive(['location_id' => 999999])->assertSessionHasErrors('location_id');

        $this->assertSame(0, ItemStock::query()->count());
    }

    // ---- Recounting --------------------------------------------------------

    private function recount(ItemStock $row, array $data)
    {
        return $this->patch(route('stock_keeper.inventory.adjust', $row), $data);
    }

    #[Test]
    public function a_recount_adjusts_the_stock_up_down_or_confirms_it(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 20);
        $row = $this->row($this->floor);

        $this->recount($row, ['counted_quantity' => 25])->assertSessionHas('success', 'Count adjusted up by 5 units.');
        $this->assertSame(25, $this->quantityAt($this->floor));

        $this->recount($row, ['counted_quantity' => 18])->assertSessionHas('success', 'Count adjusted down by 7 units.');
        $this->assertSame(18, $this->quantityAt($this->floor));

        $this->recount($row, ['counted_quantity' => 18])->assertSessionHas('success', 'Count confirmed — no change.');
        $this->assertSame(18, $this->quantityAt($this->floor));
    }

    #[Test]
    public function a_recount_may_be_zero_but_never_negative_or_missing(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 20);
        $row = $this->row($this->floor);

        $this->recount($row, ['counted_quantity' => -1])->assertSessionHasErrors('counted_quantity');
        $this->recount($row, [])->assertSessionHasErrors('counted_quantity');
        $this->recount($row, ['counted_quantity' => 'many'])->assertSessionHasErrors('counted_quantity');
        $this->assertSame(20, $this->quantityAt($this->floor));

        $this->recount($row, ['counted_quantity' => 0])->assertSessionHasNoErrors();
        $this->assertSame(0, $this->quantityAt($this->floor));
    }

    #[Test]
    public function a_recount_can_change_the_low_stock_line(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 20);

        $this->recount($this->row($this->floor), ['counted_quantity' => 20, 'min_stock_level' => 7])->assertSessionHasNoErrors();

        $this->assertSame(7, (int) $this->row($this->floor)->min_stock_level);
    }

    // ---- Transfers ---------------------------------------------------------

    private function raise(array $overrides = [])
    {
        return $this->post(route('stock_keeper.transfers.store'), $overrides + [
            'item_variant_id' => $this->variant->id,
            'quantity' => 12,
            'source_location_type' => StockLocation::class,
            'source_location_id' => $this->floor->id,
            'destination_location_type' => StockLocation::class,
            'destination_location_id' => $this->shelf->id,
        ]);
    }

    #[Test]
    public function a_transfer_needs_a_variant_quantity_and_both_ends(): void
    {
        $this->raise(['item_variant_id' => 999999])->assertSessionHasErrors('item_variant_id');
        $this->raise(['quantity' => 0])->assertSessionHasErrors('quantity');
        $this->post(route('stock_keeper.transfers.store'), ['item_variant_id' => $this->variant->id, 'quantity' => 1])
            ->assertSessionHasErrors(['from_store_id', 'to_store_id']);

        $this->assertSame(0, Transfer::query()->count());
    }

    #[Test]
    public function a_transfer_cannot_start_and_end_in_the_same_place(): void
    {
        $this->raise(['destination_location_id' => $this->floor->id])->assertSessionHasErrors('destination_location_id');

        $this->assertSame(0, Transfer::query()->count());
    }

    #[Test]
    public function a_transfer_must_name_a_place_that_exists(): void
    {
        $this->raise(['source_location_id' => 999999])->assertSessionHasErrors('source_location_id');
        $this->raise(['destination_location_id' => 999999])->assertSessionHasErrors('destination_location_id');
    }

    #[Test]
    public function cancelling_a_queued_transfer_moves_no_stock(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 40);
        $this->raise()->assertSessionHasNoErrors();
        $transfer = Transfer::query()->sole();

        $this->post(route('stock_keeper.transfers.cancel', $transfer))->assertSessionHas('success');

        $this->assertSame(TransferWorkflowService::STATUS_CANCELLED, $transfer->fresh()->status);
        $this->assertSame(40, $this->quantityAt($this->floor));
        $this->assertSame(0, $this->quantityAt($this->shelf));
    }

    #[Test]
    public function a_completed_transfer_cannot_be_cancelled_and_the_stock_stays_put(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 40);
        $this->raise();
        $transfer = Transfer::query()->sole();
        $this->post(route('stock_keeper.transfers.dispatch', $transfer));
        $this->post(route('stock_keeper.transfers.complete', $transfer));

        $this->post(route('stock_keeper.transfers.cancel', $transfer))->assertSessionHas('error');

        $this->assertSame(TransferWorkflowService::STATUS_COMPLETED, $transfer->fresh()->status);
        $this->assertSame([28, 12], [$this->quantityAt($this->floor), $this->quantityAt($this->shelf)]);
    }

    #[Test]
    public function a_cancelled_transfer_cannot_be_dispatched_or_completed(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 40);
        $this->raise();
        $transfer = Transfer::query()->sole();
        $this->post(route('stock_keeper.transfers.cancel', $transfer));

        $this->post(route('stock_keeper.transfers.dispatch', $transfer))->assertSessionHas('error');
        $this->post(route('stock_keeper.transfers.complete', $transfer))->assertSessionHas('error');

        $this->assertSame(40, $this->quantityAt($this->floor));
        $this->assertSame(0, $this->quantityAt($this->shelf));
    }

    #[Test]
    public function a_transfer_cannot_be_completed_before_it_is_dispatched(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 40);
        $this->raise();
        $transfer = Transfer::query()->sole();

        $this->post(route('stock_keeper.transfers.complete', $transfer))->assertSessionHas('error');

        $this->assertSame(TransferWorkflowService::STATUS_PENDING, $transfer->fresh()->status);
        $this->assertSame(0, $this->quantityAt($this->shelf));
    }

    #[Test]
    public function the_transfer_board_filters_by_status(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 40);
        $this->raise();
        $this->raise(['quantity' => 3]);
        $this->post(route('stock_keeper.transfers.cancel', Transfer::query()->orderBy('id')->first()));

        $this->get(route('stock_keeper.transfers.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('StockKeeper/Transfers/index')->where('filters.status', 'all'));
        $this->get(route('stock_keeper.transfers.index', ['status' => 'pending']))
            ->assertInertia(fn ($page) => $page->where('pagination.total', 1));
    }

    // ---- Alerts, variants, welcome ----------------------------------------

    #[Test]
    public function the_alerts_list_separates_low_stock_from_out_of_stock(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 3);
        $this->row($this->floor)->update(['min_stock_level' => 5]);

        $this->get(route('stock_keeper.alerts.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('StockKeeper/StockAlerts/index')->where('summary.low_stock', 1)->where('summary.out_of_stock', 0));

        $this->get(route('stock_keeper.alerts.index', ['severity' => 'out_of_stock']))
            ->assertInertia(fn ($page) => $page->where('filters.severity', 'out_of_stock')->where('pagination.total', 0));
        // An unknown severity is ignored: the list is the same as unfiltered.
        $this->get(route('stock_keeper.alerts.index', ['severity' => 'nonsense']))
            ->assertInertia(fn ($page) => $page->where('pagination.total', 1));
        $this->get(route('stock_keeper.alerts.index', ['search' => 'zzz-no-such-item']))
            ->assertInertia(fn ($page) => $page->where('pagination.total', 0));
    }

    #[Test]
    public function the_variant_picker_lists_the_variants_of_an_item(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 8);

        $this->getJson(route('stock_keeper.inventory.items.variants', $this->item))->assertOk()
            ->assertJsonStructure(['variants'])
            ->assertJsonCount(1, 'variants');

        $this->getJson(route('stock_keeper.inventory.items.variants', 999999))->assertOk()->assertJsonCount(0, 'variants');
    }

    #[Test]
    public function the_inventory_list_searches_and_filters_by_location(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 8);

        $this->get(route('stock_keeper.inventory.index', ['search' => 'zzz-no-such-item']))->assertOk()
            ->assertInertia(fn ($page) => $page->component('StockKeeper/Inventory/index')->where('pagination.total', 0));
        $this->get(route('stock_keeper.inventory.index', ['location_type' => StockLocation::class, 'location_id' => $this->floor->id]))->assertOk()
            ->assertInertia(fn ($page) => $page->where('filters.location_id', $this->floor->id));
    }

    #[Test]
    public function a_guest_sees_the_stock_keeper_welcome_page_but_not_the_app(): void
    {
        auth()->logout();
        $this->app['auth']->forgetGuards();

        $this->get(route('stock_keeper.welcome'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('StockKeeper/Welcome/index'));
        $this->get(route('stock_keeper.inventory.index'))->assertRedirect(route('stock_keeper.login'));
        $this->post(route('stock_keeper.inventory.receive'), [])->assertRedirect(route('stock_keeper.login'));
        $this->post(route('stock_keeper.transfers.cancel', 1))->assertRedirect(route('stock_keeper.login'));
    }
}
