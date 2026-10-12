<?php

declare(strict_types=1);

namespace Tests\Feature\StockKeeper;

use App\Models\Auth\User;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Stock levels at a store floor: full / low / crit-low lines like the seller's
 * shelf (no bins), and a hand-entered CBM capacity.
 */
class LocationLevelsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Item $item;

    private StockLocation $floor;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['stock_keeper', 'admin'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();

        $this->item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $this->item->id]);
        StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $this->item->id, 'item_variant_id' => $variant->id, 'active' => true]);
        app(StockService::class)->receive((int) $variant->id, $this->floor, 50);

        $keeper = User::factory()->create(['role' => 'stock_keeper']);
        $keeper->assignRole('stock_keeper');

        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.'.config('app.system_domain')]);
        $this->actingAs($keeper->refresh());
    }

    #[Test]
    public function the_levels_page_lists_the_floor_with_its_items(): void
    {
        $this->get(route('stock_keeper.levels.index', ['location' => $this->floor->id]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('StockKeeper/Levels/index')
                ->where('board.location.id', $this->floor->id)
                ->where('board.counts.items', 1)
                ->where('board.items.0.item_id', $this->item->id)
                ->where('board.items.0.level', null));
    }

    #[Test]
    public function a_keeper_sets_full_low_and_crit_and_the_status_follows(): void
    {
        $this->put(route('stock_keeper.levels.update', [$this->floor->id, $this->item->id]), ['max' => 100, 'low' => 60, 'critical' => 5])
            ->assertRedirect();

        $band = ShelfItemBand::query()->where('stock_location_id', $this->floor->id)->where('item_id', $this->item->id)->sole();
        $this->assertSame([100, 60, 5], [$band->max_units, $band->refill_units, $band->critical_units]);

        // 50 on hand, low line at 60: low stock.
        $this->get(route('stock_keeper.levels.index', ['location' => $this->floor->id]))
            ->assertInertia(fn (Assert $page) => $page->where('board.items.0.status', 'low')->where('board.counts.low', 1));
    }

    #[Test]
    public function lines_out_of_order_are_refused(): void
    {
        $this->put(route('stock_keeper.levels.update', [$this->floor->id, $this->item->id]), ['max' => 10, 'low' => 20, 'critical' => 5])
            ->assertSessionHasErrors('max');

        $this->assertDatabaseCount('shelf_item_bands', 0);
    }

    #[Test]
    public function capacity_is_saved_and_cleared(): void
    {
        $this->put(route('stock_keeper.levels.capacity', $this->floor->id), ['capacity_cbm' => 450.5])->assertRedirect();
        $this->assertSame(450.5, $this->floor->fresh()->capacity_cbm);

        $this->put(route('stock_keeper.levels.capacity', $this->floor->id), ['capacity_cbm' => ''])->assertRedirect();
        $this->assertNull($this->floor->fresh()->capacity_cbm);
    }

    #[Test]
    public function a_store_shelf_has_no_levels_here(): void
    {
        $shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();

        $this->put(route('stock_keeper.levels.update', [$shelf->id, $this->item->id]), ['max' => 10, 'low' => 5, 'critical' => 1])
            ->assertForbidden();
    }
}
