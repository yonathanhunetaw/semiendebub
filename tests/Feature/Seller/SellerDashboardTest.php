<?php

namespace Tests\Feature\Seller;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantIndividualPrice;
use App\Models\Store\StoreVariantSellerPrice;
use App\Models\StockKeeper\ItemStock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class SellerDashboardTest extends TestCase
{
    use RefreshDatabase;

    protected User $seller;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withServerVariables(['HTTP_HOST' => 'seller.localhost']);

        $this->store = Store::factory()->create();

        $this->seller = User::factory()->create([
            'store_id' => $this->store->id,
            'role'     => 'seller',
        ]);

        \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'seller']);
        $this->seller->assignRole('seller');

        $this->actingAs($this->seller, 'web');
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Creates an active Item + ItemVariant + StoreVariant with a pricing_matrix.
     * Returns [$item, $itemVariant, $storeVariant].
     */
    private function createItemWithPrice(int|float $basePrice, int|float|null $discountPrice = null, string $productName = 'Test Item'): array
    {
        $item = Item::factory()->create([
            'product_name' => $productName,
            'status'       => 'active',
        ]);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $storeVariant = StoreVariant::factory()->create([
            'store_id'        => $this->store->id,
            'item_variant_id' => $variant->id,
            'active'          => true,
            'pricing_matrix'  => [
                'price'            => $basePrice,
                'discount_price'   => $discountPrice,
                'discount_ends_at' => $discountPrice ? now()->addDays(7)->toDateTimeString() : null,
            ],
        ]);

        return [$item, $variant, $storeVariant];
    }

    private function addStock(StoreVariant $storeVariant, int $qty): void
    {
        ItemStock::create([
            'item_variant_id' => $storeVariant->id,
            'location_id'     => $this->store->id,
            'location_type'   => Store::class,
            'quantity'        => $qty,
        ]);
    }

    // =========================================================================
    // DASHBOARD (INDEX) TESTS
    // =========================================================================

    #[Test]
    public function dashboard_returns_200_for_authenticated_seller()
    {
        $response = $this->get(route('seller.dashboard'));
        $response->assertStatus(200);
        $response->assertInertia(fn(Assert $page) => $page->component('Seller/Items/Index'));
    }

    #[Test]
    public function dashboard_returns_empty_list_when_store_has_no_items()
    {
        $response = $this->get(route('seller.dashboard'));
        $response->assertInertia(fn(Assert $page) => $page->has('items', 0));
    }

    #[Test]
    public function dashboard_shows_only_items_belonging_to_sellers_store()
    {
        // Item in seller's store
        $this->createItemWithPrice(100, productName: 'My Store Item');

        // Item in another store (should NOT appear)
        $otherStore = Store::factory()->create();
        $itemB       = Item::factory()->create(['product_name' => 'Other Store Item', 'status' => 'active']);
        $variantB    = ItemVariant::factory()->create(['item_id' => $itemB->id]);
        StoreVariant::factory()->create([
            'store_id'        => $otherStore->id,
            'item_variant_id' => $variantB->id,
        ]);

        $response = $this->get(route('seller.dashboard'));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->has('items', 1)
                ->where('items.0.product_name', 'My Store Item')
        );
    }

    #[Test]
    public function dashboard_returns_base_store_price_when_no_overrides_exist()
    {
        $this->createItemWithPrice(150);

        $response = $this->get(route('seller.dashboard'));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->has('items', 1)
                ->where('items.0.store_price', 150)
                ->where('items.0.final_price', 150)
        );
    }

    #[Test]
    public function dashboard_applies_discount_price_when_base_discount_is_set()
    {
        $this->createItemWithPrice(150, 100);

        $response = $this->get(route('seller.dashboard'));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->has('items', 1)
                ->where('items.0.store_price', 150)
                ->where('items.0.final_price', 100)
        );
    }

    #[Test]
    public function dashboard_uses_seller_price_when_seller_override_exists()
    {
        [, , $storeVariant] = $this->createItemWithPrice(200);

        StoreVariantSellerPrice::create([
            'store_variant_id' => $storeVariant->id,
            'seller_id'        => $this->seller->id,
            'pricing_matrix'   => ['price' => 160, 'discount_price' => null, 'discount_ends_at' => null],
            'active'           => true,
        ]);

        $response = $this->get(route('seller.dashboard'));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->has('items', 1)
                ->where('items.0.store_price', 200)    // base store price
                ->where('items.0.final_price', 160)    // seller override
        );
    }

    #[Test]
    public function dashboard_uses_customer_price_when_cart_with_customer_is_passed()
    {
        [, , $storeVariant] = $this->createItemWithPrice(200);

        $customer = Customer::factory()->create(['store_id' => $this->store->id, 'tin_number' => null]);

        StoreVariantCustomerPrice::create([
            'store_variant_id' => $storeVariant->id,
            'customer_id'      => $customer->id,
            'pricing_matrix'   => ['price' => 120, 'discount_price' => null, 'discount_ends_at' => null],
            'active'           => true,
        ]);

        $cart = \App\Models\Seller\Cart::create([
            'seller_id'   => $this->seller->id,
            'customer_id' => $customer->id,
            'store_id'    => $this->store->id,
            'status'      => 'open',
        ]);

        $response = $this->get(route('seller.dashboard', ['cart_id' => $cart->id]));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->has('items', 1)
                ->where('items.0.final_price', 120)    // customer price wins
        );
    }

    #[Test]
    public function dashboard_filters_by_search_query()
    {
        $this->createItemWithPrice(50, productName: 'Blue Marker');
        $this->createItemWithPrice(50, productName: 'Red Highlighter');

        $response = $this->get(route('seller.dashboard', ['search' => 'Marker']));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->has('items', 1)
                ->where('items.0.product_name', 'Blue Marker')
        );

        $empty = $this->get(route('seller.dashboard', ['search' => 'Notebook']));
        $empty->assertInertia(fn(Assert $page) => $page->has('items', 0));
    }

    // =========================================================================
    // SHOW PAGE TESTS
    // =========================================================================

    #[Test]
    public function show_page_returns_200_for_valid_item()
    {
        [$item] = $this->createItemWithPrice(100);

        $response = $this->get(route('seller.items.show', $item));
        $response->assertStatus(200);
        $response->assertInertia(fn(Assert $page) => $page->component('Seller/Items/Show'));
    }

    #[Test]
    public function show_page_returns_variant_with_correct_base_price()
    {
        [$item, , $storeVariant] = $this->createItemWithPrice(99);
        $this->addStock($storeVariant, 30);

        $response = $this->get(route('seller.items.show', $item));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->component('Seller/Items/Show')
                ->has('variantData', 1)
                ->where('variantData.0.price', 99)
                ->where('variantData.0.final_price', 99)
        );
    }

    #[Test]
    public function show_page_reflects_discount_price()
    {
        [$item, , $storeVariant] = $this->createItemWithPrice(200, 150);
        $this->addStock($storeVariant, 10);

        $response = $this->get(route('seller.items.show', $item));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->where('variantData.0.price', 200)
                ->where('variantData.0.discount_price', 150)
                ->where('variantData.0.final_price', 150)
        );
    }

    #[Test]
    public function show_page_returns_correct_polymorphic_stock()
    {
        [$item, , $storeVariant] = $this->createItemWithPrice(100);
        $this->addStock($storeVariant, 45);

        $response = $this->get(route('seller.items.show', $item));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->where('variantData.0.stock', 45)
                ->where('variantData.0.store_active', true)
        );
    }

    #[Test]
    public function show_page_exposes_seller_price_for_the_current_seller()
    {
        [$item, , $storeVariant] = $this->createItemWithPrice(200);

        StoreVariantSellerPrice::create([
            'store_variant_id' => $storeVariant->id,
            'seller_id'        => $this->seller->id,
            'pricing_matrix'   => ['price' => 170, 'discount_price' => null, 'discount_ends_at' => null],
            'active'           => true,
        ]);

        // Pass seller_id explicitly so Show controller picks it up
        $response = $this->get(route('seller.items.show', ['item' => $item, 'seller_id' => $this->seller->id]));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->where('variantData.0.price', 200)
                ->where('variantData.0.seller_price', 170)
                ->where('variantData.0.final_price', 170)
        );
    }

    #[Test]
    public function show_page_price_ladder_is_present_and_contains_store_tier()
    {
        [$item] = $this->createItemWithPrice(100);

        $response = $this->get(route('seller.items.show', $item));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->has('variantData.0.price_ladder')
                ->where('variantData.0.price_ladder.0.level', 'store')
                ->where('variantData.0.price_ladder.0.price', 100)
        );
    }

    #[Test]
    public function show_page_price_ladder_includes_seller_tier_when_override_exists()
    {
        [$item, , $storeVariant] = $this->createItemWithPrice(200);

        StoreVariantSellerPrice::create([
            'store_variant_id' => $storeVariant->id,
            'seller_id'        => $this->seller->id,
            'pricing_matrix'   => ['price' => 180, 'discount_price' => null, 'discount_ends_at' => null],
            'active'           => true,
        ]);

        $response = $this->get(route('seller.items.show', ['item' => $item, 'seller_id' => $this->seller->id]));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->where('variantData.0.price_ladder.0.level', 'store')
                ->where('variantData.0.price_ladder.1.level', 'seller')
                ->where('variantData.0.price_ladder.1.price', 180)
        );
    }

    #[Test]
    public function show_page_display_price_is_lowest_active_final_price()
    {
        [$item] = $this->createItemWithPrice(300);

        // Add a second variant at a lower price on the same item
        $variantB      = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id'        => $this->store->id,
            'item_variant_id' => $variantB->id,
            'active'          => true,
            'pricing_matrix'  => ['price' => 120, 'discount_price' => null, 'discount_ends_at' => null],
        ]);

        $response = $this->get(route('seller.items.show', $item));
        $response->assertInertia(
            fn(Assert $page) => $page
                ->has('variantData', 2)
                ->where('displayPrice', 120) // min of [300, 120]
        );
    }

    #[Test]
    public function dashboard_and_show_prices_are_in_sync()
    {
        // Discount price = 200, base = 250 → final_price should be 200 everywhere
        [$item] = $this->createItemWithPrice(250, 200);

        // Dashboard
        $dashResponse = $this->get(route('seller.dashboard'));
        $dashResponse->assertInertia(
            fn(Assert $page) => $page->where('items.0.final_price', 200)
        );

        // Show — displayPrice is min(final_price across variants)
        $showResponse = $this->get(route('seller.items.show', $item));
        $showResponse->assertInertia(
            fn(Assert $page) => $page->where('displayPrice', 200)
        );
    }
}
