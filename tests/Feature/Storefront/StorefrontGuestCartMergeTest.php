<?php

declare(strict_types=1);

namespace Tests\Feature\Storefront;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\CartService;
use App\Services\Fulfillment\OrderSourcingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The storefront paths StorefrontCartAndAccountTest leaves alone: a guest's
 * cart carried into their account at sign-in, a storefront with no store yet,
 * checkout as a guest, and agreeing to a delayed delivery.
 */
class StorefrontGuestCartMergeTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private ItemVariant $variant;

    private User $shopper;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create(['name' => 'Main Store', 'status' => 'active']);
        config(['storefront.store_id' => $this->store->id]);

        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id, 'item_id' => $item->id, 'item_variant_id' => $this->variant->id, 'active' => true,
            'pricing_matrix' => ['price' => 20.0, 'discount_price' => null, 'discount_ends_at' => null],
        ]);
        ItemStock::updateOrCreate(
            ['item_variant_id' => $this->variant->id, 'location_type' => Store::class, 'location_id' => $this->store->id],
            ['quantity' => 10, 'min_stock_level' => 0],
        );

        $this->shopper = User::factory()->create(['role' => 'user', 'email_verified_at' => now()]);
    }

    private function guestCart(string $session, int $quantity, int $extraPieces = 0, ?float $extraPrice = null): Cart
    {
        $cart = Cart::query()->create(['session_id' => $session, 'user_id' => null, 'store_id' => $this->store->id, 'status' => 'pending']);
        $cart->variants()->attach($this->variant->id, [
            'quantity' => $quantity, 'price' => 20.0, 'extra_pieces' => $extraPieces, 'extra_piece_price' => $extraPrice, 'store_id' => $this->store->id,
        ]);

        return $cart;
    }

    private function merge(string $session): void
    {
        app(CartService::class)->mergeGuestCart($this->shopper, $this->store->id, $session);
    }

    private function line(): ?object
    {
        $cart = Cart::query()->where('user_id', $this->shopper->id)->sole();

        return $cart->variants()->where('item_variants.id', $this->variant->id)->first()?->pivot;
    }

    // ---- Merging the guest cart at sign-in ---------------------------------

    #[Test]
    public function a_guests_cart_becomes_the_shoppers_cart_with_its_loose_pieces(): void
    {
        $guest = $this->guestCart('guest-session', 3, 4, 2.5);

        $this->merge('guest-session');

        $line = $this->line();
        $this->assertSame(3, (int) $line->quantity);
        $this->assertSame(4, (int) $line->extra_pieces, 'loose pieces must survive signing in');
        $this->assertEquals(2.5, $line->extra_piece_price);
        $this->assertModelMissing($guest);
    }

    #[Test]
    public function a_guest_line_stacks_onto_the_same_line_already_in_the_account(): void
    {
        $own = Cart::query()->create(['user_id' => $this->shopper->id, 'store_id' => $this->store->id, 'status' => 'pending']);
        $own->variants()->attach($this->variant->id, ['quantity' => 2, 'price' => 20.0, 'extra_pieces' => 1, 'extra_piece_price' => 2.5, 'store_id' => $this->store->id]);
        $this->guestCart('guest-session', 3, 2, 2.5);

        $this->merge('guest-session');

        $line = $this->line();
        $this->assertSame(5, (int) $line->quantity);
        $this->assertSame(3, (int) $line->extra_pieces);
        $this->assertSame(1, Cart::query()->count(), 'one cart per shopper');
    }

    #[Test]
    public function a_merged_line_never_exceeds_the_storefront_limit(): void
    {
        config(['storefront.max_line_quantity' => 5]);
        $own = Cart::query()->create(['user_id' => $this->shopper->id, 'store_id' => $this->store->id, 'status' => 'pending']);
        $own->variants()->attach($this->variant->id, ['quantity' => 4, 'price' => 20.0, 'store_id' => $this->store->id]);
        $this->guestCart('guest-session', 4);

        $this->merge('guest-session');

        $this->assertSame(5, (int) $this->line()->quantity);
    }

    #[Test]
    public function the_merge_uses_the_storefront_cart_status(): void
    {
        config(['storefront.cart_status' => 'open']);
        $this->guestCart('guest-session', 2);

        $this->merge('guest-session');

        $this->assertSame('open', Cart::query()->where('user_id', $this->shopper->id)->sole()->status);
    }

    #[Test]
    public function nothing_happens_without_a_guest_cart_or_for_another_stores_guest_cart(): void
    {
        $this->merge('nobody');
        $this->assertSame(0, Cart::query()->count());

        $other = Store::factory()->create(['name' => 'Elsewhere']);
        Cart::query()->create(['session_id' => 'guest-session', 'user_id' => null, 'store_id' => $other->id, 'status' => 'pending']);
        $this->merge('guest-session');
        $this->assertSame(0, Cart::query()->whereNotNull('user_id')->count());
    }

    #[Test]
    public function the_current_session_is_merged_when_no_session_id_is_given(): void
    {
        $this->startSession();
        $this->guestCart(session()->getId(), 2);

        app(CartService::class)->mergeGuestCart($this->shopper, $this->store->id);

        $this->assertSame(2, (int) $this->line()->quantity);
    }

    // ---- The storefront with no store --------------------------------------

    #[Test]
    public function the_storefront_says_so_when_no_store_is_published(): void
    {
        config(['storefront.store_id' => null]);
        Store::query()->delete();

        $this->get(route('storefront.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('User/Dashboard/index')
                ->where('store', null)
                ->where('items', [])
                ->where('error', 'Our catalogue is not published yet. Please check back shortly.'));

        $this->post(route('storefront.cart.items.store'), ['variant_id' => $this->variant->id, 'quantity' => 1])
            ->assertSessionHas('error', 'The storefront is currently unavailable.');
    }

    // ---- Adding loose pieces ---------------------------------------------

    #[Test]
    public function loose_pieces_or_boxes_are_refused_for_a_pack_that_cannot_be_split(): void
    {
        $this->post(route('storefront.cart.items.store'), ['variant_id' => $this->variant->id, 'quantity' => 1, 'extra_pieces' => 2])
            ->assertSessionHasErrors('extra_pieces');
        $this->post(route('storefront.cart.items.store'), ['variant_id' => $this->variant->id, 'quantity' => 1, 'extra_boxes' => 1])
            ->assertSessionHasErrors('extra_boxes');

        $this->assertSame(0, Cart::query()->count());
    }

    // ---- Checkout ----------------------------------------------------------

    #[Test]
    public function a_guest_checking_out_is_sent_to_sign_in_with_the_cart_kept(): void
    {
        // A browser carries its session cookie between requests; the test client does not.
        $session = str_repeat('g', 40);
        $this->guestCart($session, 2);
        $this->withCookie(config('session.cookie'), $session);

        $this->post(route('storefront.checkout'))
            ->assertRedirect(route('login'))
            ->assertSessionHas('status')
            ->assertSessionHas('url.intended', route('storefront.index'));

        $this->assertSame(1, Cart::query()->whereNull('user_id')->count());
    }

    #[Test]
    public function a_delayed_delivery_must_be_agreed_to_before_checkout(): void
    {
        $this->actingAs($this->shopper);
        $this->post(route('storefront.cart.items.store'), ['variant_id' => $this->variant->id, 'quantity' => 2])->assertSessionHas('success');

        $this->mock(OrderSourcingService::class, function ($mock) {
            $mock->shouldReceive('groupCart')->andReturn(['groups' => [], 'requires_agreement' => true, 'delayed_line_count' => 1]);
        });

        $this->post(route('storefront.checkout'))->assertSessionHasErrors('accept_delayed_items');
        // Agreed: on to the checkout page, which carries the agreement.
        $this->post(route('storefront.checkout'), ['accept_delayed_items' => true])
            ->assertRedirect(route('storefront.checkout.show', array_filter(['store' => $this->store->slug, 'agreed' => 1])));
    }
}
