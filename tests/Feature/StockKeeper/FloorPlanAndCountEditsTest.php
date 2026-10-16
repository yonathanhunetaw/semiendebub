<?php

declare(strict_types=1);

namespace Tests\Feature\StockKeeper;

use App\Models\Auth\User;
use App\Models\Inventory\FloorArea;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Stocktake;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The stock keeper's edits after the first save (WarehouseFeaturesTest covers
 * creating): moving, renaming and removing floor areas, taking an item out,
 * clearing a location's levels, and voiding or refusing a stocktake.
 */
class FloorPlanAndCountEditsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $floor;

    private StockLocation $shelf;

    private Item $item;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $this->item = Item::factory()->create(['status' => 'active', 'product_name' => 'Cement']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $this->item->id]);
        app(StockService::class)->receive((int) $this->variant->id, $this->floor, 40);

        $keeper = User::factory()->create(['role' => 'stock_keeper']);
        $keeper->assignRole('stock_keeper');

        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.'.config('app.system_domain')]);
        $this->actingAs($keeper->refresh());
    }

    private function area(string $code = 'A1', array $at = ['x' => 0, 'y' => 0, 'width' => 4, 'length' => 4]): FloorArea
    {
        $this->post(route('stock_keeper.floor.areas.store', $this->floor), ['code' => $code] + $at)->assertSessionHasNoErrors();

        return FloorArea::query()->where('code', $code)->sole();
    }

    // ---- Floor plan --------------------------------------------------------

    #[Test]
    public function an_area_needs_the_floor_size_first(): void
    {
        $this->post(route('stock_keeper.floor.areas.store', $this->floor), ['code' => 'A1', 'x' => 0, 'y' => 0, 'width' => 2, 'length' => 2])
            ->assertSessionHasErrors(['floor' => 'Set the floor size first.']);
    }

    #[Test]
    public function an_area_without_a_kind_or_with_an_unknown_one_is_storage(): void
    {
        $this->put(route('stock_keeper.floor.size', $this->floor), ['width' => 20, 'length' => 20]);

        $this->assertSame('storage', $this->area('A1')->kind);
        $this->post(route('stock_keeper.floor.areas.store', $this->floor), ['code' => 'B1', 'kind' => 'volcano', 'x' => 10, 'y' => 10, 'width' => 2, 'length' => 2])
            ->assertSessionHasNoErrors();
        $this->assertSame('storage', FloorArea::query()->where('code', 'B1')->sole()->kind);
    }

    #[Test]
    public function a_store_shelf_has_no_floor_plan(): void
    {
        $this->put(route('stock_keeper.floor.size', $this->shelf), ['width' => 10, 'length' => 10])
            ->assertSessionHasErrors('floor');
    }

    #[Test]
    public function an_area_is_moved_and_renamed_but_not_onto_another_areas_code(): void
    {
        $this->put(route('stock_keeper.floor.size', $this->floor), ['width' => 20, 'length' => 20]);
        $a1 = $this->area('A1');
        $this->area('B1', ['x' => 10, 'y' => 10, 'width' => 4, 'length' => 4]);

        $this->put(route('stock_keeper.floor.areas.update', [$this->floor, $a1]), ['code' => 'A2', 'name' => 'Cement bay', 'x' => 5, 'y' => 0, 'width' => 4, 'length' => 4])
            ->assertSessionHas('success');
        $a1->refresh();
        $this->assertSame(['A2', 'Cement bay', 5.0], [$a1->code, $a1->name, (float) $a1->x_m]);

        $this->put(route('stock_keeper.floor.areas.update', [$this->floor, $a1]), ['code' => 'B1', 'x' => 5, 'y' => 0, 'width' => 4, 'length' => 4])
            ->assertSessionHasErrors('floor');
        $this->assertSame('A2', $a1->fresh()->code);
    }

    #[Test]
    public function an_item_is_taken_out_and_a_removed_area_leaves_it_unplaced(): void
    {
        $this->put(route('stock_keeper.floor.size', $this->floor), ['width' => 20, 'length' => 20]);
        $area = $this->area();
        $this->post(route('stock_keeper.floor.areas.place', [$this->floor, $area]), ['item_id' => $this->item->id])->assertSessionHasNoErrors();
        $this->assertSame(1, $area->items()->count());

        $this->delete(route('stock_keeper.floor.areas.unplace', [$this->floor, $area, $this->item]))
            ->assertSessionHas('success', 'Cement taken out of A1.');
        $this->assertSame(0, $area->items()->count());

        $this->delete(route('stock_keeper.floor.areas.destroy', [$this->floor, $area]))->assertSessionHas('success');
        $this->assertModelMissing($area);
    }

    #[Test]
    public function an_area_is_reached_only_through_its_own_location(): void
    {
        $this->put(route('stock_keeper.floor.size', $this->floor), ['width' => 20, 'length' => 20]);
        $area = $this->area();
        $otherFloor = StockLocation::query()->where('store_id', Store::factory()->create(['type' => Store::TYPE_RETAIL])->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();

        $this->delete(route('stock_keeper.floor.areas.destroy', [$otherFloor, $area]))->assertNotFound();
        $this->assertModelExists($area);
    }

    // ---- Levels --------------------------------------------------------------

    #[Test]
    public function a_locations_levels_for_an_item_are_cleared(): void
    {
        ShelfItemBand::query()->create(['stock_location_id' => $this->floor->id, 'item_id' => $this->item->id, 'max_units' => 100, 'refill_units' => 40, 'critical_units' => 10]);

        $this->delete(route('stock_keeper.levels.destroy', [$this->floor, $this->item]))
            ->assertSessionHas('success', 'Levels cleared for Cement.');

        $this->assertSame(0, ShelfItemBand::query()->where('stock_location_id', $this->floor->id)->count());
    }

    // ---- Stocktakes ----------------------------------------------------------

    #[Test]
    public function an_empty_count_cannot_be_submitted_and_a_voided_one_is_closed(): void
    {
        $this->post(route('stock_keeper.stocktakes.store'), ['stock_location_id' => $this->floor->id])->assertRedirect();
        $take = Stocktake::query()->sole();

        $this->post(route('stock_keeper.stocktakes.submit', $take))->assertSessionHas('error', 'Count at least one line before submitting.');

        $this->post(route('stock_keeper.stocktakes.void', $take))->assertSessionHas('success', 'Count voided. Nothing was booked.');
        $this->assertSame(Stocktake::VOIDED, $take->fresh()->status);

        $this->post(route('stock_keeper.stocktakes.void', $take))->assertSessionHas('error');
        $this->post(route('stock_keeper.stocktakes.count', $take), ['item_variant_id' => $this->variant->id, 'counted' => 3])
            ->assertSessionHas('error');

        // Voiding frees the place for a new count.
        $this->post(route('stock_keeper.stocktakes.store'), ['stock_location_id' => $this->floor->id])->assertSessionMissing('error');
        $this->assertSame(2, Stocktake::query()->count());
    }

    #[Test]
    public function a_count_cannot_be_negative(): void
    {
        $this->post(route('stock_keeper.stocktakes.store'), ['stock_location_id' => $this->floor->id]);
        $take = Stocktake::query()->sole();

        $response = $this->post(route('stock_keeper.stocktakes.count', $take), ['item_variant_id' => $this->variant->id, 'counted' => -1]);
        $this->assertTrue($response->getSession()->has('errors') || $response->getSession()->has('error'), 'a negative count is refused');
        $this->assertNull($take->lines()->sole()->counted, 'the expected line stays uncounted');
    }
}
