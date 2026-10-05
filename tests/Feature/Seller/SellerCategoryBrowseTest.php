<?php

declare(strict_types=1);

namespace Tests\Feature\Seller;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The seller's Store pills and Categories tab: category filtering, department
 * counts, the best-seller card and the open-carts badge.
 */
class SellerCategoryBrowseTest extends TestCase
{
    use RefreshDatabase;

    private User $seller;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withServerVariables(['HTTP_HOST' => 'seller.localhost']);

        $this->store = Store::factory()->create();
        $this->seller = User::factory()->create(['store_id' => $this->store->id, 'role' => 'seller']);
        \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'seller']);
        $this->seller->assignRole('seller');

        $this->actingAs($this->seller, 'web');
    }

    /** An active item in $category that $store carries; returns its store variant. */
    private function carriedItem(string $name, ItemCategory $category, ?Store $store = null): StoreVariant
    {
        $item = Item::factory()->create(['product_name' => $name, 'status' => 'active', 'item_category_id' => $category->id]);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        return StoreVariant::factory()->create([
            'store_id' => ($store ?? $this->store)->id,
            'item_variant_id' => $variant->id,
            'active' => true,
            'pricing_matrix' => ['price' => 10, 'discount_price' => null, 'discount_ends_at' => null],
        ]);
    }

    private function sell(StoreVariant $storeVariant, int $quantity, string $status = 'completed'): void
    {
        $saleId = DB::table('sales')->insertGetId([
            'store_id' => $storeVariant->store_id,
            'status' => $status,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('sale_items')->insert([
            'sale_id' => $saleId,
            'store_variant_id' => $storeVariant->id,
            'quantity' => $quantity,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    #[Test]
    public function store_pills_list_every_category_the_store_carries_and_filter_the_grid(): void
    {
        $paper = ItemCategory::factory()->create(['category_name' => 'Paper']);
        $pens = ItemCategory::factory()->create(['category_name' => 'Pens']);
        $elsewhere = ItemCategory::factory()->create(['category_name' => 'Not Here']);
        $this->carriedItem('A4 Ream', $paper);
        $this->carriedItem('Blue Pen', $pens);
        $this->carriedItem('Other Store Thing', $elsewhere, Store::factory()->create());

        $this->get(route('seller.dashboard', ['category_id' => $pens->id]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Seller/Items/Index')
                ->where('filters.category_id', $pens->id)
                ->where('categories', [
                    ['id' => $paper->id, 'name' => 'Paper'],
                    ['id' => $pens->id, 'name' => 'Pens'],
                ])
                ->has('items', 1)
                ->where('items.0.product_name', 'Blue Pen'));
    }

    #[Test]
    public function categories_tab_counts_department_items_including_subcategories(): void
    {
        $art = ItemCategory::factory()->create(['category_name' => 'Art Materials']);
        $canvas = ItemCategory::factory()->create(['category_name' => 'Canvas', 'parent_id' => $art->id]);
        $brushes = ItemCategory::factory()->create(['category_name' => 'Paint Brush', 'parent_id' => $art->id]);
        $this->carriedItem('Easel', $art);
        $this->carriedItem('Canvas 30x40', $canvas);
        $this->carriedItem('Canvas 50x70', $canvas);
        $this->carriedItem('Fan Brush', $brushes);

        $this->get(route('seller.categories.index', ['category_id' => $art->id]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Seller/Categories/Index')
                ->where('selectedCategory.id', $art->id)
                ->where('selectedCategory.product_count', 4)
                ->where('subcategoryCount', 2)
                ->has('subcategories', 2)
                ->where('subcategories.0.category_name', 'Canvas')
                ->where('subcategories.0.active_items_count', 2)
                ->where('featuredItem', null));
    }

    #[Test]
    public function featured_item_is_the_departments_best_seller_at_this_store(): void
    {
        $art = ItemCategory::factory()->create(['category_name' => 'Art Materials']);
        $canvas = ItemCategory::factory()->create(['category_name' => 'Canvas', 'parent_id' => $art->id]);
        $slow = $this->carriedItem('Slow Canvas', $canvas);
        $fast = $this->carriedItem('Fast Canvas', $canvas);

        $this->sell($slow, 3);
        $this->sell($fast, 5);
        $this->sell($slow, 10, 'canceled'); // doesn't count

        $this->get(route('seller.categories.index', ['category_id' => $art->id]))
            ->assertInertia(fn (Assert $page) => $page
                ->where('featuredItem.product_name', 'Fast Canvas')
                ->where('featuredItem.units_sold', 5));
    }

    #[Test]
    public function sellers_get_their_open_cart_count_for_the_nav_badge(): void
    {
        Cart::create(['seller_id' => $this->seller->id, 'store_id' => $this->store->id, 'status' => 'open']);
        Cart::create(['seller_id' => $this->seller->id, 'store_id' => $this->store->id, 'status' => 'open']);
        Cart::create(['seller_id' => $this->seller->id, 'store_id' => $this->store->id, 'status' => 'completed']);

        $this->get(route('seller.dashboard'))
            ->assertInertia(fn (Assert $page) => $page->where('seller.open_carts', 2));
    }

    #[Test]
    public function search_prices_for_the_same_cart_as_the_store_page(): void
    {
        $this->carriedItem('Blue Pen', ItemCategory::factory()->create());
        // A walk-in cart (no customer) prices as individual: VAT-inclusive.
        Cart::create(['seller_id' => $this->seller->id, 'store_id' => $this->store->id, 'status' => 'open']);

        foreach ([route('seller.dashboard'), route('seller.items.search', ['search' => 'Blue'])] as $url) {
            $this->get($url)->assertInertia(fn (Assert $page) => $page
                ->where('has_tin_cart', true)
                ->where('top_cart_is_individual', true)
                ->where('items.0.product_name', 'Blue Pen'));
        }
    }

    #[Test]
    public function cart_console_lists_only_carts_that_can_still_take_items(): void
    {
        $open = Cart::create(['seller_id' => $this->seller->id, 'store_id' => $this->store->id, 'status' => 'open']);
        Cart::create(['seller_id' => $this->seller->id, 'store_id' => $this->store->id, 'status' => 'completed']);

        $this->get(route('seller.carts.index'))
            ->assertInertia(fn (Assert $page) => $page
                ->has('carts', 1)
                ->where('carts.0.id', $open->id));
    }
}
