<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * catalogue:apply: the decisions.csv from the AI interview. A dry run changes nothing; applying
 * moves items into (new) categories, switches stores on and off, and only with its own flag
 * clears stock, through the ledger.
 */
class CatalogueApplyTest extends TestCase
{
    use RefreshDatabase;

    private Store $main;

    private Store $second;

    private Item $item;

    private ItemVariant $variant;

    private ItemCategory $old;

    private string $file;

    protected function setUp(): void
    {
        parent::setUp();

        $this->main = Store::factory()->create(['name' => 'Main Store', 'status' => 'active']);
        $this->second = Store::factory()->create(['name' => 'Second Store', 'status' => 'active']);
        $this->old = ItemCategory::factory()->create(['category_name' => 'Old']);
        $this->item = Item::factory()->create(['product_name' => 'Pencil HB', 'item_category_id' => $this->old->id]);
        $this->variant = ItemVariant::factory()->create(['item_id' => $this->item->id]);
        foreach ([$this->main, $this->second] as $store) {
            StoreVariant::factory()->create(['store_id' => $store->id, 'item_id' => $this->item->id, 'item_variant_id' => $this->variant->id, 'active' => true, 'pricing_matrix' => []]);
        }
        $this->file = tempnam(sys_get_temp_dir(), 'decisions').'.csv';
    }

    protected function tearDown(): void
    {
        @unlink($this->file);
        parent::tearDown();
    }

    private function decisions(string $category, string $soldIn, string $stockAt = ''): void
    {
        file_put_contents($this->file, "item_id,item,new_category_path,sold_in,stock_at,note\n{$this->item->id},Pencil HB,{$category},{$soldIn},{$stockAt},\n");
    }

    private function floor(Store $store): StockLocation
    {
        return StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
    }

    #[Test]
    public function a_dry_run_shows_the_changes_and_changes_nothing(): void
    {
        $this->decisions('Writing Tools > Pencil', 'Main Store;Second Store');
        $categories = ItemCategory::query()->count();

        $this->artisan('catalogue:apply', ['file' => $this->file])
            ->expectsOutputToContain('Dry run: nothing was changed')
            ->assertSuccessful();

        $this->assertSame($categories, ItemCategory::query()->count());
        $this->assertSame($this->old->id, (int) $this->item->fresh()->item_category_id);
    }

    #[Test]
    public function applying_creates_the_path_moves_the_item_and_a_second_run_finds_nothing_to_do(): void
    {
        $this->decisions('Writing Tools > Pencil', 'Main Store;Second Store');

        $this->artisan('catalogue:apply', ['file' => $this->file, '--apply' => true, '--force' => true])->assertSuccessful();

        $pencil = ItemCategory::query()->where('category_name', 'Pencil')->sole();
        $this->assertSame('Writing Tools', $pencil->parent->category_name);
        $this->assertNull($pencil->parent->parent_id);
        $this->assertSame($pencil->id, (int) $this->item->fresh()->item_category_id);
        $this->assertNotNull($this->old->fresh(), 'old categories are never deleted');

        $count = ItemCategory::query()->count();
        $this->artisan('catalogue:apply', ['file' => $this->file, '--apply' => true, '--force' => true])
            ->expectsOutputToContain('Items moved to another category')
            ->assertSuccessful();
        $this->assertSame($count, ItemCategory::query()->count(), 'no category is created twice');
    }

    #[Test]
    public function an_existing_category_is_found_by_its_path_whatever_the_letter_case(): void
    {
        $parent = ItemCategory::factory()->create(['category_name' => 'Writing Tools']);
        $child = ItemCategory::factory()->create(['category_name' => 'Pencil', 'parent_id' => $parent->id]);
        $this->decisions('writing tools > PENCIL', 'Main Store;Second Store');

        $this->artisan('catalogue:apply', ['file' => $this->file, '--apply' => true, '--force' => true])->assertSuccessful();

        $this->assertSame($child->id, (int) $this->item->fresh()->item_category_id);
        $this->assertSame(1, ItemCategory::query()->where('category_name', 'Pencil')->count());
    }

    #[Test]
    public function keep_leaves_the_category_alone(): void
    {
        $this->decisions('KEEP', 'Main Store;Second Store');

        $this->artisan('catalogue:apply', ['file' => $this->file, '--apply' => true, '--force' => true])->assertSuccessful();

        $this->assertSame($this->old->id, (int) $this->item->fresh()->item_category_id);
    }

    #[Test]
    public function a_store_not_named_stops_selling_the_item_and_one_named_sells_again(): void
    {
        $this->decisions('KEEP', 'Main Store');

        $this->artisan('catalogue:apply', ['file' => $this->file, '--apply' => true, '--force' => true])->assertSuccessful();

        $this->assertTrue((bool) StoreVariant::query()->where('store_id', $this->main->id)->sole()->active);
        $this->assertFalse((bool) StoreVariant::query()->where('store_id', $this->second->id)->sole()->active);

        $this->decisions('KEEP', 'Main Store;Second Store');
        $this->artisan('catalogue:apply', ['file' => $this->file, '--apply' => true, '--force' => true])->assertSuccessful();
        $this->assertTrue((bool) StoreVariant::query()->where('store_id', $this->second->id)->sole()->active);
    }

    #[Test]
    public function a_bad_file_is_refused_whole_and_nothing_changes(): void
    {
        $this->decisions('Writing Tools > Pencil', 'Main Store;Nowhere Store', 'Atlantis Hub');

        $this->artisan('catalogue:apply', ['file' => $this->file, '--apply' => true, '--force' => true])
            ->expectsOutputToContain('The file cannot be used')
            ->assertFailed();

        $this->assertSame($this->old->id, (int) $this->item->fresh()->item_category_id);
        $this->assertSame(0, ItemCategory::query()->where('category_name', 'Pencil')->count());
        $this->assertTrue((bool) StoreVariant::query()->where('store_id', $this->second->id)->sole()->active);
    }

    #[Test]
    public function an_unknown_item_and_a_wrong_header_are_refused(): void
    {
        file_put_contents($this->file, "item_id,item,new_category_path,sold_in,stock_at,note\n999999,Ghost,KEEP,Main Store,,\n");
        $this->artisan('catalogue:apply', ['file' => $this->file])->assertFailed();

        file_put_contents($this->file, "id,name,category\n1,x,y\n");
        $this->artisan('catalogue:apply', ['file' => $this->file])->assertFailed();
    }

    #[Test]
    public function stock_outside_the_chosen_places_is_only_reported_unless_clearing_is_asked_for(): void
    {
        $floor = $this->floor($this->main);
        $elsewhere = $this->floor($this->second);
        app(StockService::class)->receive($this->variant->id, $floor, 10);
        app(StockService::class)->receive($this->variant->id, $elsewhere, 7);
        $this->decisions('KEEP', 'Main Store;Second Store', 'Main Store · Store Floor');

        $this->artisan('catalogue:apply', ['file' => $this->file, '--apply' => true, '--force' => true])
            ->expectsOutputToContain('Second Store · Store Floor')
            ->assertSuccessful();

        $this->assertSame(7, (int) ItemStock::query()->where('stock_location_id', $elsewhere->id)->value('quantity'), 'reported, not touched');
    }

    #[Test]
    public function clearing_sets_unlisted_stock_to_zero_through_the_ledger_and_leaves_the_chosen_place_alone(): void
    {
        $floor = $this->floor($this->main);
        $elsewhere = $this->floor($this->second);
        app(StockService::class)->receive($this->variant->id, $floor, 10);
        app(StockService::class)->receive($this->variant->id, $elsewhere, 7);
        $this->decisions('KEEP', 'Main Store;Second Store', 'Main Store · Store Floor');

        $this->artisan('catalogue:apply', ['file' => $this->file, '--apply' => true, '--clear-unlisted-stock' => true, '--force' => true])->assertSuccessful();

        $this->assertSame(0, (int) ItemStock::query()->where('stock_location_id', $elsewhere->id)->value('quantity'));
        $this->assertSame(10, (int) ItemStock::query()->where('stock_location_id', $floor->id)->value('quantity'));
        $this->assertDatabaseHas('inventory_movements', [
            'stock_location_id' => $elsewhere->id, 'item_variant_id' => $this->variant->id, 'type' => 'adjust', 'quantity' => -7, 'balance_after' => 0,
        ]);
    }

    #[Test]
    public function clearing_without_apply_changes_nothing(): void
    {
        $elsewhere = $this->floor($this->second);
        app(StockService::class)->receive($this->variant->id, $elsewhere, 7);
        $this->decisions('KEEP', 'Main Store;Second Store', 'Main Store · Store Floor');

        $this->artisan('catalogue:apply', ['file' => $this->file, '--clear-unlisted-stock' => true])->assertSuccessful();

        $this->assertSame(7, (int) ItemStock::query()->where('stock_location_id', $elsewhere->id)->value('quantity'));
    }
}
