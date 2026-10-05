<?php

namespace Tests\Feature\Seller;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CartControllerTest extends TestCase
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

    #[Test]
    public function seller_can_create_a_new_cart()
    {
        $customer = Customer::factory()->create(['store_id' => $this->store->id]);

        $response = $this->post(route('seller.carts.store'), [
            'customer_id' => $customer->id,
            'seller_id'   => $this->seller->id,
        ]);

        $response->assertRedirect(route('seller.carts.index'));
        $this->assertDatabaseHas('carts', [
            'seller_id'   => $this->seller->id,
            'customer_id' => $customer->id,
            'store_id'    => $this->store->id,
            'status'      => 'open',
        ]);
    }

    #[Test]
    public function seller_can_select_all_customers_when_creating_a_cart()
    {
        $storeCustomer = Customer::factory()->create([
            'store_id' => $this->store->id,
            'first_name' => 'Store',
            'last_name' => 'Customer',
        ]);
        $otherCustomer = Customer::factory()->create([
            'store_id' => Store::factory()->create()->id,
            'first_name' => 'Other',
            'last_name' => 'Customer',
        ]);

        $this->get(route('seller.carts.create'))
            ->assertInertia(fn (Assert $page) => $page
                ->component('Seller/Carts/Create')
                ->has('customers', 2)
                ->where('customers.0.id', $otherCustomer->id)
                ->where('customers.1.id', $storeCustomer->id)
            );
    }

    #[Test]
    public function seller_can_add_item_variant_to_cart()
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id'        => $this->store->id,
            'item_variant_id' => $variant->id,
            'pricing_matrix'  => ['price' => 2333.00, 'discount_price' => null, 'discount_ends_at' => null],
        ]);

        $cart = Cart::create([
            'seller_id' => $this->seller->id,
            'store_id'  => $this->store->id,
            'status'    => 'open',
        ]);

        // Prices posted by the client are ignored: the line is stamped from
        // the price ladder. Both figures below are deliberately wrong to prove
        // the server does not take them.
        $response = $this->post(route('seller.carts.items.store', $cart), [
            'variant_id' => $variant->id,
            'quantity'   => 2,
            'price'      => 1.00,
        ]);

        $response->assertRedirect();
        $response->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cart_items', [
            'cart_id'         => $cart->id,
            'item_variant_id' => $variant->id,
            'quantity'        => 2,
            // The ladder price, not the posted 1.00.
            'price'           => 2333.00,
        ]);
    }

    #[Test]
    public function extra_pieces_need_a_piece_tier_variant_to_price_against()
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id'        => $this->store->id,
            'item_variant_id' => $variant->id,
            'pricing_matrix'  => ['price' => 2333.00, 'discount_price' => null, 'discount_ends_at' => null],
        ]);

        $cart = Cart::create([
            'seller_id' => $this->seller->id,
            'store_id'  => $this->store->id,
            'status'    => 'open',
        ]);

        // This product is not sold loose, so extra pieces cannot be priced and
        // the line is refused rather than billed at a client-supplied rate.
        $this->post(route('seller.carts.items.store', $cart), [
            'variant_id' => $variant->id,
            'quantity'   => 1,
            'extra_pieces' => 1,
            'extra_piece_price' => 48.60,
        ])->assertSessionHasErrors('extra_pieces');

        $this->assertDatabaseMissing('cart_items', ['cart_id' => $cart->id]);
    }

    #[Test]
    public function seller_can_remove_item_variant_from_cart()
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $cart = Cart::create([
            'seller_id' => $this->seller->id,
            'store_id'  => $this->store->id,
            'status'    => 'open',
        ]);

        $cart->variants()->attach($variant->id, [
            'quantity' => 1,
            'price'    => 500.00,
            'store_id' => $this->store->id,
        ]);

        $response = $this->delete(route('seller.carts.items.destroy', [$cart, $variant]));

        $response->assertRedirect();
        $this->assertDatabaseMissing('cart_items', [
            'cart_id'         => $cart->id,
            'item_variant_id' => $variant->id,
        ]);
    }

    #[Test]
    public function cart_displays_the_price_saved_when_the_item_was_added()
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $cart = Cart::create([
            'seller_id' => $this->seller->id,
            'store_id' => $this->store->id,
            'status' => 'open',
        ]);

        $cart->variants()->attach($variant->id, [
            'quantity' => 1,
            'price' => 1900.00,
            'store_id' => $this->store->id,
        ]);

        // There is one cart page: show() opens the cart in the console.
        $this->get(route('seller.carts.show', $cart))
            ->assertRedirect(route('seller.carts.index', ['cart' => $cart->id]));

        $this->get(route('seller.carts.index', ['cart' => $cart->id]))
            ->assertInertia(fn (Assert $page) => $page
                ->component('Seller/Carts/Index')
                ->where('focus_cart', $cart->id)
                ->where('carts.0.lines.0.price', 1900)
            );
    }
}
