<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\Stocktake;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Services\Item\ItemDeployer;
use App\Services\Item\ItemPlaces;
use App\Services\Item\ItemReadiness;
use App\Services\Inventory\StocktakeService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Limits at the floor, Remote Hub and warehouses, the refill route, and counting an item from the setup page. */
class ItemSetupStockTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Item $item;

    private ItemVariant $variant;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        Role::firstOrCreate(['name' => 'admin']);
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->admin = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $this->admin->assignRole('admin');
        $this->actingAs($this->admin);

        $this->store = Store::factory()->create(['name' => 'Main Store', 'status' => 'active']);
        $this->item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $this->item->id]);
        app(ItemDeployer::class)->deploy($this->item, $this->store);
    }

    private function place(string $kind): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->store->id)->where('kind', $kind)->firstOrFail();
    }

    private function floor(): StockLocation
    {
        return $this->place(StockLocation::KIND_BACKROOM);
    }

    // ---- limits at the other places -------------------------------------------------

    #[Test]
    public function limits_are_set_at_the_floor_and_a_warehouse_and_the_page_lists_them(): void
    {
        $hub = StockLocation::factory()->mainHub()->create();

        $this->put(route('admin.items.setup.bin', [$this->item, $this->floor()]), ['max' => 50, 'refill' => 20, 'critical' => 5])->assertRedirect();
        $this->put(route('admin.items.setup.bin', [$this->item, $hub]), ['max' => 500, 'refill' => 100, 'critical' => 20])->assertRedirect();
        $this->assertSame(2, ShelfItemBand::query()->count());

        $this->get(route('admin.items.setup', $this->item))->assertInertia(fn ($page) => $page
            ->where('stores.0.places.1.kind', 'backroom')
            ->where('stores.0.places.1.band.max', 50)
            ->where('warehouses.0.band.max', 500));

        $this->delete(route('admin.items.setup.bin.destroy', [$this->item, $hub]))->assertRedirect();
        $this->assertSame(1, ShelfItemBand::query()->count());
    }

    #[Test]
    public function only_someone_who_may_edit_a_place_can_save_limits_there(): void
    {
        $seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $places = app(ItemPlaces::class);

        $this->assertFalse($places->canEdit($seller, $this->place(StockLocation::KIND_SHELF)));
        $this->assertFalse($places->canEdit($seller, $this->floor()));
        $this->assertTrue($places->canEdit($this->admin, $this->floor()));
        $this->assertTrue($places->canEdit($this->admin, $this->place(StockLocation::KIND_SHELF)));
    }

    // ---- refill route -------------------------------------------------------------------

    #[Test]
    public function a_refill_route_is_saved_in_order_and_bad_ones_are_refused(): void
    {
        $url = route('admin.items.setup.route', [$this->item, $this->store]);

        $this->put($url, ['sources' => ['remote_hub', 'floor']])->assertRedirect();
        $this->assertSame(['remote_hub', 'floor'], ItemRefillRoute::query()->sole()->sources);

        $this->get(route('admin.items.setup', $this->item))->assertInertia(fn ($page) => $page
            ->where('stores.0.route.sources', ['remote_hub', 'floor'])->where('stores.0.route.set', true)->where('stores.0.route.can_edit', true));

        $this->put($url, ['sources' => ['floor', 'floor']])->assertSessionHasErrors('sources.0');
        $this->put($url, ['sources' => ['nowhere']])->assertSessionHasErrors('sources.0');
        $this->put($url, ['sources' => []])->assertSessionHasErrors('sources');
        $this->assertSame(['remote_hub', 'floor'], ItemRefillRoute::query()->sole()->sources);
    }

    // ---- counting ----------------------------------------------------------------------------

    private function stocked(int $units = 10): void
    {
        app(StockService::class)->receive($this->variant->id, $this->floor(), $units);
    }

    private function countIt(int $counted): \Illuminate\Testing\TestResponse
    {
        return $this->post(route('admin.items.setup.count', [$this->item, $this->floor()]), ['counts' => [$this->variant->id => $counted]]);
    }

    #[Test]
    public function a_count_is_submitted_then_approved_and_the_ledger_books_the_difference(): void
    {
        $this->stocked(10);

        $this->countIt(8)->assertRedirect()->assertSessionHas('success');
        $take = Stocktake::query()->sole();
        $this->assertSame(Stocktake::SUBMITTED, $take->status);
        $this->assertSame(8, (int) $take->lines()->where('item_variant_id', $this->variant->id)->value('counted'));
        $this->assertSame(10, (int) ItemStock::query()->where('stock_location_id', $this->floor()->id)->value('quantity'), 'submitting books nothing');

        $this->get(route('admin.items.setup', $this->item))->assertInertia(fn ($page) => $page
            ->where('stores.0.places.1.count.open.status', 'submitted')->where('stores.0.places.1.count.open.only_this_item', true)
            ->where('stores.0.places.1.count.lines.0.counted', 8));

        $this->post(route('admin.items.setup.count.approve', [$this->item, $take]))->assertRedirect()->assertSessionHas('success');
        $this->assertSame(Stocktake::POSTED, $take->fresh()->status);
        $this->assertSame(8, (int) ItemStock::query()->where('stock_location_id', $this->floor()->id)->value('quantity'));
        $this->assertDatabaseHas('inventory_movements', ['stock_location_id' => $this->floor()->id, 'type' => 'adjust', 'quantity' => -2]);

        $check = collect(app(ItemReadiness::class)->for($this->item->fresh())['stores'][$this->store->id]['checks'])->firstWhere('key', 'count');
        $this->assertTrue($check['done'], 'an approved count is what the Counted check wants');
    }

    #[Test]
    public function a_second_count_is_refused_while_one_waits_for_approval_and_a_void_clears_the_way(): void
    {
        $this->stocked(10);
        $this->countIt(9)->assertRedirect();
        $take = Stocktake::query()->sole();

        $this->countIt(7)->assertSessionHasErrors('count');
        $this->assertSame(1, Stocktake::query()->count());

        $this->post(route('admin.items.setup.count.void', [$this->item, $take]))->assertRedirect()->assertSessionHas('success');
        $this->assertSame(Stocktake::VOIDED, $take->fresh()->status);
        $this->assertSame(10, (int) ItemStock::query()->where('stock_location_id', $this->floor()->id)->value('quantity'));

        $this->countIt(7)->assertRedirect()->assertSessionHas('success');
    }

    #[Test]
    public function a_count_in_progress_by_someone_else_is_joined_not_submitted(): void
    {
        $this->stocked(10);
        $keeper = User::factory()->create(['role' => 'stock_keeper', 'store_id' => $this->store->id]);
        $take = app(StocktakeService::class)->start($this->floor(), $keeper, 'Monthly count');

        $this->countIt(6)->assertRedirect()->assertSessionHas('success');

        $this->assertSame(Stocktake::COUNTING, $take->fresh()->status, 'it is still the keeper\'s to submit');
        $this->assertSame(6, (int) $take->lines()->where('item_variant_id', $this->variant->id)->value('counted'));
    }

    #[Test]
    public function a_count_that_also_holds_other_items_is_not_approved_from_an_item_page(): void
    {
        $this->stocked(10);
        $other = ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]);
        app(StockService::class)->receive($other->id, $this->floor(), 5);
        $keeper = User::factory()->create(['role' => 'stock_keeper', 'store_id' => $this->store->id]);
        $take = app(StocktakeService::class)->start($this->floor(), $keeper);
        app(StocktakeService::class)->count($take, $other->id, 4, $keeper);
        app(StocktakeService::class)->count($take, $this->variant->id, 9, $keeper);
        app(StocktakeService::class)->submit($take, $keeper);

        $this->post(route('admin.items.setup.count.approve', [$this->item, $take]))->assertSessionHasErrors('count');
        $this->post(route('admin.items.setup.count.void', [$this->item, $take]))->assertSessionHasErrors('count');
        $this->assertSame(Stocktake::SUBMITTED, $take->fresh()->status);
        $this->assertSame(5, (int) ItemStock::query()->where('item_variant_id', $other->id)->value('quantity'));
    }

    #[Test]
    public function counting_needs_a_figure_for_this_items_variants_and_an_admin(): void
    {
        $this->stocked(10);

        $this->post(route('admin.items.setup.count', [$this->item, $this->floor()]), ['counts' => [$this->variant->id => '']])->assertSessionHasErrors('count');
        $foreign = ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]);
        $this->post(route('admin.items.setup.count', [$this->item, $this->floor()]), ['counts' => [$foreign->id => 3]])->assertSessionHasErrors('count');
        $this->assertSame(0, Stocktake::query()->count());

        $seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $this->actingAs($seller)->post(route('admin.items.setup.count', [$this->item, $this->floor()]), ['counts' => [$this->variant->id => 3]])->assertForbidden();
    }
}
