<?php

declare(strict_types=1);

namespace Tests\Feature\Storefront;

use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\StorefrontCatalogService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The public storefront catalogue: what a shopper can find, and in what order.
 *
 * The grid had a search box and category pills and nothing else — no ordering,
 * no way to hide what the store cannot ship, no way to see only what is
 * discounted. Price is the awkward one: it is not a column but a ladder
 * resolved through PriceProvider per store variant, so ordering by it cannot be
 * done in SQL. These tests pin that it is nonetheless correct across page
 * boundaries, which is the part a naive "sort the current page" implementation
 * gets wrong.
 */
class StorefrontCatalogueTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private ItemCategory $stationery;

    private ItemCategory $art;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create(['name' => 'Main Store', 'status' => 'active']);
        config(['storefront.store_id' => $this->store->id]);

        $this->stationery = ItemCategory::factory()->create(['category_name' => 'Stationery']);
        $this->art = ItemCategory::factory()->create(['category_name' => 'Art']);
    }

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

    /**
     * A sellable product: an active item with one active store variant, priced
     * and stocked at this store.
     */
    private function sellable(
        string $name,
        float $price,
        int $stock = 50,
        ?float $discount = null,
        ?ItemCategory $category = null,
    ): Item {
        $item = Item::factory()->create([
            'product_name' => $name,
            'status' => 'active',
            'item_category_id' => ($category ?? $this->stationery)->id,
        ]);

        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $variant->id,
            'item_id' => $item->id,
            'active' => true,
            'pricing_matrix' => [
                'price' => $price,
                'discount_price' => $discount,
                'discount_ends_at' => $discount !== null ? now()->addWeek()->toDateTimeString() : null,
            ],
        ]);

        ItemStock::updateOrCreate(
            [
                'item_variant_id' => $variant->id,
                'location_type' => Store::class,
                'location_id' => $this->store->id,
            ],
            ['quantity' => $stock, 'min_stock_level' => 0],
        );

        return $item;
    }

    /** @return array<int, string> */
    private function titlesOnPage(array $query = []): array
    {
        $response = $this->get(route('storefront.index', $query));
        $response->assertOk();

        return array_column($response->viewData('page')['props']['items'], 'title');
    }

    /* =====================================================================
     | Ordering
     |====================================================================*/

    #[Test]
    public function the_grid_lists_products_by_name_by_default(): void
    {
        $this->sellable('Notebook', 100.0);
        $this->sellable('Abacus', 200.0);
        $this->sellable('Zebra pen', 50.0);

        $this->assertSame(['Abacus', 'Notebook', 'Zebra pen'], $this->titlesOnPage());
    }

    #[Test]
    public function a_shopper_can_order_by_price(): void
    {
        $this->sellable('Notebook', 100.0);
        $this->sellable('Abacus', 200.0);
        $this->sellable('Zebra pen', 50.0);

        $this->assertSame(
            ['Zebra pen', 'Notebook', 'Abacus'],
            $this->titlesOnPage(['sort' => 'price_asc']),
        );
        $this->assertSame(
            ['Abacus', 'Notebook', 'Zebra pen'],
            $this->titlesOnPage(['sort' => 'price_desc']),
        );
    }

    #[Test]
    public function price_ordering_holds_across_page_boundaries(): void
    {
        // Sorting only the rows on the current page is the easy mistake, and it
        // produces a listing that restarts its ordering on page two.
        foreach ([90.0, 10.0, 70.0, 30.0, 50.0] as $index => $price) {
            $this->sellable("Item {$index}", $price);
        }

        config(['storefront.per_page' => 2]);

        $this->assertSame(
            ['Item 1', 'Item 3'],
            $this->titlesOnPage(['sort' => 'price_asc']),
            'Cheapest two overall belong on page one.'
        );
        $this->assertSame(
            ['Item 4', 'Item 2'],
            $this->titlesOnPage(['sort' => 'price_asc', 'page' => 2]),
            'Page two continues the same ordering rather than starting over.'
        );
        $this->assertSame(
            ['Item 0'],
            $this->titlesOnPage(['sort' => 'price_asc', 'page' => 3]),
        );
    }

    #[Test]
    public function newest_orders_by_when_the_product_was_added(): void
    {
        $oldest = $this->sellable('Older', 100.0);
        $newest = $this->sellable('Newer', 100.0);

        $oldest->forceFill(['created_at' => now()->subMonth()])->save();
        $newest->forceFill(['created_at' => now()])->save();

        $this->assertSame(['Newer', 'Older'], $this->titlesOnPage(['sort' => 'newest']));
    }

    #[Test]
    public function an_unknown_sort_falls_back_to_the_default(): void
    {
        $this->sellable('Notebook', 100.0);
        $this->sellable('Abacus', 200.0);

        // The sort arrives in a query string a shopper can edit or share.
        $response = $this->get(route('storefront.index', ['sort' => 'nonsense']));
        $response->assertOk();

        $props = $response->viewData('page')['props'];
        $this->assertSame('name', $props['filters']['sort']);
        $this->assertSame(['Abacus', 'Notebook'], array_column($props['items'], 'title'));
    }

    /* =====================================================================
     | Availability
     |====================================================================*/

    #[Test]
    public function the_in_stock_filter_hides_what_the_store_cannot_ship(): void
    {
        $this->sellable('Has stock', 100.0, stock: 25);
        $this->sellable('Sold out', 100.0, stock: 0);

        $this->assertSame(['Has stock', 'Sold out'], $this->titlesOnPage());
        $this->assertSame(['Has stock'], $this->titlesOnPage(['in_stock' => 1]));
    }

    #[Test]
    public function the_on_sale_filter_keeps_only_discounted_products(): void
    {
        $this->sellable('Full price', 100.0);
        $this->sellable('Reduced', 100.0, discount: 60.0);

        $this->assertSame(['Reduced'], $this->titlesOnPage(['on_sale' => 1]));
    }

    #[Test]
    public function the_filters_combine(): void
    {
        $this->sellable('Reduced and stocked', 100.0, stock: 10, discount: 60.0);
        $this->sellable('Reduced but gone', 100.0, stock: 0, discount: 60.0);
        $this->sellable('Stocked full price', 100.0, stock: 10);

        $this->assertSame(
            ['Reduced and stocked'],
            $this->titlesOnPage(['on_sale' => 1, 'in_stock' => 1]),
        );
    }

    #[Test]
    public function the_filter_state_comes_back_to_the_page(): void
    {
        $this->sellable('Notebook', 100.0);

        $props = $this->get(route('storefront.index', [
            'sort' => 'price_desc',
            'in_stock' => 1,
            'on_sale' => 0,
            'search' => 'Note',
        ]))->assertOk()->viewData('page')['props'];

        $this->assertSame('price_desc', $props['filters']['sort']);
        $this->assertTrue($props['filters']['in_stock']);
        $this->assertFalse($props['filters']['on_sale']);
        $this->assertSame('Note', $props['filters']['search']);
        // The control needs its options from the server, not a hardcoded list.
        $this->assertSame(
            ['name', 'newest', 'price_asc', 'price_desc'],
            array_column($props['sorts'], 'value'),
        );
    }

    /* =====================================================================
     | Related products
     |====================================================================*/

    #[Test]
    public function a_product_page_suggests_others_from_the_same_category(): void
    {
        $subject = $this->sellable('Subject', 100.0);
        $this->sellable('Same shelf', 120.0);
        $this->sellable('Different shelf', 130.0, category: $this->art);

        $props = $this->get(route('storefront.items.show', $subject))
            ->assertOk()
            ->viewData('page')['props'];

        $titles = array_column($props['related'], 'title');

        $this->assertContains('Same shelf', $titles);
        $this->assertNotContains('Subject', $titles, 'A product is not related to itself.');
    }

    #[Test]
    public function the_related_rail_falls_back_to_the_rest_of_the_store(): void
    {
        // Only product in its category — a rail that would otherwise be empty.
        $subject = $this->sellable('Lonely', 100.0, category: $this->art);
        $this->sellable('Elsewhere', 120.0);

        $props = $this->get(route('storefront.items.show', $subject))
            ->assertOk()
            ->viewData('page')['props'];

        $this->assertSame(['Elsewhere'], array_column($props['related'], 'title'));
    }

    #[Test]
    public function related_products_never_include_something_this_store_does_not_sell(): void
    {
        $subject = $this->sellable('Subject', 100.0);

        // Active item, but no active store variant here.
        $elsewhere = Item::factory()->create([
            'product_name' => 'Not sold here',
            'status' => 'active',
            'item_category_id' => $this->stationery->id,
        ]);
        ItemVariant::factory()->create(['item_id' => $elsewhere->id]);

        $props = $this->get(route('storefront.items.show', $subject))
            ->assertOk()
            ->viewData('page')['props'];

        $this->assertNotContains(
            'Not sold here',
            array_column($props['related'], 'title'),
        );
    }

    /* =====================================================================
     | The page the shopper lands on
     |====================================================================*/

    #[Test]
    public function the_storefront_renders_the_user_dashboard_component(): void
    {
        $this->sellable('Notebook', 100.0);

        $response = $this->get(route('storefront.index'));

        $response->assertOk();
        // Renamed from Guest/ to User/; the controller must follow.
        $this->assertSame('User/Dashboard/index', $response->viewData('page')['component']);
    }

    #[Test]
    public function the_product_page_renders_the_user_show_component(): void
    {
        $item = $this->sellable('Notebook', 100.0);

        $response = $this->get(route('storefront.items.show', $item));

        $response->assertOk();
        $this->assertSame('User/Dashboard/Show', $response->viewData('page')['component']);
    }
}
