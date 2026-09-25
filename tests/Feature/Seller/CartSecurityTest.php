<?php

declare(strict_types=1);

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
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Covers the two cart write paths a seller can reach:
 *
 *   POST /carts/reorder        -> CartController::reorder
 *   POST /carts/{cart}/items   -> CartController::storeItem
 *
 * Both previously trusted client input: `reorder` wrote to any cart id with no
 * authorization, and `storeItem` took the line `price` straight from the
 * request.
 */
class CartSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected User $seller;

    protected Store $store;

    protected Store $otherStore;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withServerVariables(['HTTP_HOST' => 'seller.localhost']);

        Role::firstOrCreate(['name' => 'seller']);
        Role::firstOrCreate(['name' => 'admin']);

        $this->store = Store::factory()->create();
        $this->otherStore = Store::factory()->create();

        $this->seller = User::factory()->create([
            'store_id' => $this->store->id,
            'role' => 'seller',
        ]);
        $this->seller->assignRole('seller');
    }

    /* ---------------------------------------------------------------------
     | Fixtures
     |--------------------------------------------------------------------*/

    /**
     * There is no Cart factory in this project, so carts are built directly.
     * Created before actingAs() so Cart::booted() cannot stamp seller_id.
     */
    private function cartFor(Store $store, ?Customer $customer = null, int $priority = 0): Cart
    {
        return Cart::create([
            'store_id' => $store->id,
            'seller_id' => null,
            'customer_id' => $customer?->id,
            'status' => 'open',
            'priority' => $priority,
        ]);
    }

    /**
     * An item variant that is active and priced in the given store.
     *
     * @return array{0: ItemVariant, 1: StoreVariant}
     */
    private function sellableVariant(Store $store, float $price, ?float $discount = null): array
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $storeVariant = StoreVariant::factory()->create([
            'store_id' => $store->id,
            'item_variant_id' => $variant->id,
            'active' => true,
            'pricing_matrix' => [
                'price' => $price,
                'discount_price' => $discount,
                'discount_ends_at' => $discount ? now()->addDays(7)->toDateTimeString() : null,
            ],
        ]);

        return [$variant, $storeVariant];
    }

    /* =====================================================================
     | reorder — happy path
     |====================================================================*/

    #[Test]
    public function seller_can_reorder_carts_in_their_own_store(): void
    {
        $first = $this->cartFor($this->store, priority: 0);
        $second = $this->cartFor($this->store, priority: 1);
        $third = $this->cartFor($this->store, priority: 2);

        $response = $this->actingAs($this->seller, 'web')
            ->from(route('seller.carts.index'))
            ->post(route('seller.carts.reorder'), [
                'order' => [$third->id, $first->id, $second->id],
            ]);

        $response->assertRedirect(route('seller.carts.index'));
        $response->assertSessionHasNoErrors();

        $this->assertSame(0, $third->fresh()->priority);
        $this->assertSame(1, $first->fresh()->priority);
        $this->assertSame(2, $second->fresh()->priority);
    }

    /* =====================================================================
     | reorder — authorization
     |====================================================================*/

    #[Test]
    public function seller_cannot_reorder_a_cart_belonging_to_another_store(): void
    {
        $mine = $this->cartFor($this->store, priority: 0);
        $theirs = $this->cartFor($this->otherStore, priority: 5);

        $response = $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.reorder'), [
                'order' => [$theirs->id, $mine->id],
            ]);

        $response->assertForbidden();

        // The whole request aborts: no partial reordering is applied.
        $this->assertSame(5, $theirs->fresh()->priority, 'Foreign cart must be untouched.');
        $this->assertSame(0, $mine->fresh()->priority, 'Own cart must not be partially reordered.');
    }

    #[Test]
    public function guests_cannot_reorder_carts(): void
    {
        $cart = $this->cartFor($this->store, priority: 3);

        $response = $this->post(route('seller.carts.reorder'), [
            'order' => [$cart->id],
        ]);

        // Unauthenticated web requests are redirected to the login screen.
        $response->assertRedirect(route('seller.login'));
        $this->assertSame(3, $cart->fresh()->priority);
    }

    #[Test]
    public function an_admin_may_reorder_carts_across_stores(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $admin->assignRole('admin');

        $foreign = $this->cartFor($this->otherStore, priority: 9);

        $this->actingAs($admin, 'web')
            ->post(route('seller.carts.reorder'), ['order' => [$foreign->id]])
            ->assertRedirect();

        $this->assertSame(0, $foreign->fresh()->priority);
    }

    /* =====================================================================
     | reorder — validation
     |====================================================================*/

    #[Test]
    public function reorder_rejects_a_missing_order_payload(): void
    {
        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.reorder'), [])
            ->assertSessionHasErrors('order');
    }

    #[Test]
    public function reorder_rejects_ids_that_are_not_carts(): void
    {
        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.reorder'), ['order' => [999999]])
            ->assertSessionHasErrors('order.0');
    }

    #[Test]
    public function reorder_rejects_non_integer_ids(): void
    {
        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.reorder'), ['order' => ['not-an-id']])
            ->assertSessionHasErrors('order.0');
    }

    #[Test]
    public function reorder_rejects_duplicate_ids(): void
    {
        $cart = $this->cartFor($this->store);

        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.reorder'), ['order' => [$cart->id, $cart->id]])
            ->assertSessionHasErrors('order.0');
    }

    /* =====================================================================
     | storeItem — happy path & server-side pricing
     |====================================================================*/

    #[Test]
    public function seller_can_add_a_variant_to_their_cart(): void
    {
        $cart = $this->cartFor($this->store);
        [$variant] = $this->sellableVariant($this->store, 250.00);

        $response = $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.items.store', $cart), [
                'variant_id' => $variant->id,
                'quantity' => 3,
            ]);

        $response->assertRedirect(route('seller.carts.show', $cart));
        $response->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cart_items', [
            'cart_id' => $cart->id,
            'item_variant_id' => $variant->id,
            'quantity' => 3,
            'price' => 250.00,
        ]);
    }

    #[Test]
    public function the_line_price_comes_from_the_price_ladder_not_the_request(): void
    {
        $cart = $this->cartFor($this->store);
        [$variant] = $this->sellableVariant($this->store, 250.00);

        // A crafted request trying to buy at 1 cent.
        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.items.store', $cart), [
                'variant_id' => $variant->id,
                'quantity' => 1,
                'price' => 0.01,
            ])
            ->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cart_items', [
            'cart_id' => $cart->id,
            'item_variant_id' => $variant->id,
            'price' => 250.00,
        ]);

        $this->assertDatabaseMissing('cart_items', [
            'cart_id' => $cart->id,
            'price' => 0.01,
        ]);
    }

    #[Test]
    public function an_active_discount_is_honoured_when_pricing_the_line(): void
    {
        $cart = $this->cartFor($this->store);
        [$variant] = $this->sellableVariant($this->store, 250.00, discount: 199.00);

        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.items.store', $cart), [
                'variant_id' => $variant->id,
                'quantity' => 1,
            ])
            ->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cart_items', [
            'cart_id' => $cart->id,
            'price' => 199.00,
        ]);
    }

    #[Test]
    public function adding_the_same_variant_twice_accumulates_quantity(): void
    {
        $cart = $this->cartFor($this->store);
        [$variant] = $this->sellableVariant($this->store, 100.00);

        foreach ([2, 3] as $quantity) {
            $this->actingAs($this->seller, 'web')
                ->post(route('seller.carts.items.store', $cart), [
                    'variant_id' => $variant->id,
                    'quantity' => $quantity,
                ])->assertSessionHasNoErrors();
        }

        $this->assertDatabaseHas('cart_items', [
            'cart_id' => $cart->id,
            'item_variant_id' => $variant->id,
            'quantity' => 5,
        ]);

        $this->assertSame(1, Cart::find($cart->id)->variants()->count(), 'Should be one line, not two.');
    }

    /* =====================================================================
     | storeItem — edge case: variant not sellable in this store
     |====================================================================*/

    #[Test]
    public function a_variant_from_another_store_cannot_be_added(): void
    {
        $cart = $this->cartFor($this->store);
        [$foreignVariant] = $this->sellableVariant($this->otherStore, 500.00);

        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.items.store', $cart), [
                'variant_id' => $foreignVariant->id,
                'quantity' => 1,
            ])
            ->assertSessionHasErrors('variant_id');

        $this->assertDatabaseMissing('cart_items', [
            'cart_id' => $cart->id,
            'item_variant_id' => $foreignVariant->id,
        ]);
    }

    #[Test]
    public function an_inactive_store_variant_cannot_be_added(): void
    {
        $cart = $this->cartFor($this->store);
        [$variant, $storeVariant] = $this->sellableVariant($this->store, 120.00);
        $storeVariant->update(['active' => false]);

        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.items.store', $cart), [
                'variant_id' => $variant->id,
                'quantity' => 1,
            ])
            ->assertSessionHasErrors('variant_id');

        $this->assertDatabaseMissing('cart_items', [
            'cart_id' => $cart->id,
            'item_variant_id' => $variant->id,
        ]);
    }

    /* =====================================================================
     | storeItem — authorization
     |====================================================================*/

    #[Test]
    public function seller_cannot_add_items_to_another_stores_cart(): void
    {
        $foreignCart = $this->cartFor($this->otherStore);
        [$variant] = $this->sellableVariant($this->otherStore, 300.00);

        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.items.store', $foreignCart), [
                'variant_id' => $variant->id,
                'quantity' => 1,
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('cart_items', ['cart_id' => $foreignCart->id]);
    }

    #[Test]
    public function guests_cannot_add_items_to_a_cart(): void
    {
        $cart = $this->cartFor($this->store);
        [$variant] = $this->sellableVariant($this->store, 100.00);

        $this->post(route('seller.carts.items.store', $cart), [
            'variant_id' => $variant->id,
            'quantity' => 1,
        ])->assertRedirect(route('seller.login'));

        $this->assertDatabaseMissing('cart_items', ['cart_id' => $cart->id]);
    }

    /* =====================================================================
     | storeItem — validation
     |====================================================================*/

    #[Test]
    public function store_item_requires_a_variant_and_quantity(): void
    {
        $cart = $this->cartFor($this->store);

        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.items.store', $cart), [])
            ->assertSessionHasErrors(['variant_id', 'quantity']);
    }

    #[Test]
    public function store_item_rejects_a_non_existent_variant(): void
    {
        $cart = $this->cartFor($this->store);

        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.items.store', $cart), [
                'variant_id' => 999999,
                'quantity' => 1,
            ])
            ->assertSessionHasErrors('variant_id');
    }

    #[Test]
    public function store_item_rejects_a_non_positive_quantity(): void
    {
        $cart = $this->cartFor($this->store);
        [$variant] = $this->sellableVariant($this->store, 100.00);

        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.items.store', $cart), [
                'variant_id' => $variant->id,
                'quantity' => 0,
            ])
            ->assertSessionHasErrors('quantity');

        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.items.store', $cart), [
                'variant_id' => $variant->id,
                'quantity' => -5,
            ])
            ->assertSessionHasErrors('quantity');
    }

    #[Test]
    public function store_item_rejects_a_non_integer_quantity(): void
    {
        $cart = $this->cartFor($this->store);
        [$variant] = $this->sellableVariant($this->store, 100.00);

        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.items.store', $cart), [
                'variant_id' => $variant->id,
                'quantity' => 'three',
            ])
            ->assertSessionHasErrors('quantity');
    }

    #[Test]
    public function store_item_rejects_negative_extra_pieces(): void
    {
        $cart = $this->cartFor($this->store);
        [$variant] = $this->sellableVariant($this->store, 100.00);

        $this->actingAs($this->seller, 'web')
            ->post(route('seller.carts.items.store', $cart), [
                'variant_id' => $variant->id,
                'quantity' => 1,
                'extra_pieces' => -1,
            ])
            ->assertSessionHasErrors('extra_pieces');
    }
}
