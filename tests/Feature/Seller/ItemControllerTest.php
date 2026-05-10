<?php

namespace Tests\Feature\Seller;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Item\ItemSize;
use PHPUnit\Framework\Attributes\Test;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;


class ItemControllerTest extends TestCase
{
    use RefreshDatabase;

    protected $seller;
    protected $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withServerVariables(['HTTP_HOST' => 'seller.localhost']);

        $this->store = Store::factory()->create();

        $this->seller = User::factory()->create([
            'store_id' => $this->store->id,
        ]);

        // ✅ Assign the role properly so $user->hasRole('seller') returns true
        // Note: Ensure the 'seller' role exists in your test database
        \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'seller']);
        $this->seller->assignRole('seller');

        $this->actingAs($this->seller, 'web');
    }

    #[Test]
    public function it_displays_only_items_assigned_to_the_sellers_store()
    {
        // Item A: Linked to Seller's Store
        $itemA = Item::factory()->create(['status' => 'active', 'product_name' => 'Store Item']);
        $variantA = ItemVariant::factory()->create(['item_id' => $itemA->id]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $variantA->id,
            'active' => true,
        ]);

        $response = $this->get(route('seller.items.index'));

        $response->assertStatus(200);

        // Item B: Not linked to any store
        Item::factory()->create(['product_name' => 'Other Item']);

        $response = $this->get(route('seller.items.index'));

        $response->assertStatus(200);
        $response->assertInertia(
            fn(Assert $page) => $page
                ->component('Seller/Items/Index')
                ->has('items', 1)
                ->where('items.0.product_name', 'Store Item')
        );
    }

    #[Test]
    public function it_filters_items_by_search_query()
    {
        $this->withoutExceptionHandling();
        $item = Item::factory()->create(['product_name' => 'Specific Gadget', 'status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $variant->id
        ]);

        $response = $this->get(route('seller.items.index', ['search' => 'Gadget']));

        $response->assertInertia(
            fn(Assert $page) => $page
                ->has('items', 1)
                ->where('items.0.product_name', 'Specific Gadget')
        );

        $responseEmpty = $this->get(route('seller.items.index', ['search' => 'NonExistent']));
        $responseEmpty->assertInertia(fn(Assert $page) => $page->has('items', 0));
    }

    #[Test]
    public function it_shows_item_details_with_correct_polymorphic_stock()
    {
        // 1. Setup Item and Variant
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        // 2. Create StoreVariant linkage
        $storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $variant->id,
            'active' => true,
            'manual_status' => 'auto', // Or whatever your accessor looks for
        ]);

        // 3. Create Polymorphic Stock for this specific store
        ItemStock::create([
            'item_variant_id' => $storeVariant->id, // As per your logic, this points to store_variant.id
            'location_id' => $this->store->id,
            'location_type' => Store::class,
            'quantity' => 45,
        ]);

        $response = $this->get(route('seller.items.show', $item));

        $response->assertStatus(200);
        $response->assertInertia(
            fn(Assert $page) => $page
                ->component('Seller/Items/Show')
                ->has('variantData', 1)
                ->where('variantData.0.stock', 45) // Confirms polymorphic stock is read
                ->where('variantData.0.store_active', true)
        );
    }

    #[Test]
    public function it_calculates_price_ladder_for_the_seller_correctly()
    {
        $this->withoutExceptionHandling();
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $variant->id,
            'price' => 100.00
        ]);

        // Create a specific price for this seller in the store_variants_seller_prices table
        \DB::table('store_variants_seller_prices')->insert([
            'store_variant_id' => $storeVariant->id,
            'seller_id' => $this->seller->id,
            'price' => 85.00,
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->get(route('seller.items.show', $item));

        $response->assertInertia(
            fn(Assert $page) => $page
                ->where('variantData.0.seller_price', 85)
                ->has('variantData.0.price_ladder')
        );
    }
}
