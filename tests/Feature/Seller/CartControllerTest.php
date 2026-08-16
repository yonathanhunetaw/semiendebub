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

        $response = $this->post(route('seller.carts.items.store', $cart), [
            'variant_id' => $variant->id,
            'quantity'   => 2,
            'price'      => 2333.00,
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('cart_items', [
            'cart_id'         => $cart->id,
            'item_variant_id' => $variant->id,
            'quantity'        => 2,
            'price'           => 2333.00,
        ]);
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
}
