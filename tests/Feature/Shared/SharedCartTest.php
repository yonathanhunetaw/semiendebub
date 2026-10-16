<?php

declare(strict_types=1);

namespace Tests\Feature\Shared;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Seller\CartShare;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Services\CartService;
use App\Services\Shared\CartShareService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Shared S1–S6: a seller shares a cart; the customer opens the link (no
 * login), sees their own prices, changes and adds lines, checks out and says
 * they sent the transfer; the account owner confirms it.
 */
class SharedCartTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private User $seller;

    private User $owner;

    private Customer $customer;

    private ItemVariant $variant;

    private ItemVariant $other;

    private PaymentAccount $account;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['name' => 'seller']);
        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->seller = $this->seller();
        $this->owner = $this->seller();
        $this->customer = Customer::factory()->create(['first_name' => 'Abebe', 'last_name' => 'Kebede', 'tin_number' => '0012345678']);

        $this->variant = $this->stocked('Thermos flask', 250.0, 20);
        $this->other = $this->stocked('Tea glass set', 100.0, 20);

        // This customer has their own price on the flask.
        StoreVariantCustomerPrice::query()->create([
            'store_variant_id' => StoreVariant::query()->where('item_variant_id', $this->variant->id)->value('id'),
            'customer_id' => $this->customer->id,
            'pricing_matrix' => ['price' => 210.0],
        ]);

        $this->account = PaymentAccount::create([
            'store_id' => $this->store->id,
            'type' => PaymentAccount::TYPE_BANK,
            'provider' => 'cbe',
            'account_number' => '1000111',
            'account_name' => 'Duka store',
            'owner_user_id' => $this->owner->id,
            'purpose' => PaymentAccount::PURPOSE_COLLECTION,
            'is_active' => true,
        ]);
    }

    private function seller(): User
    {
        $user = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $user->assignRole('seller');

        return $user->refresh();
    }

    private function stocked(string $name, float $price, int $units): ItemVariant
    {
        $item = Item::factory()->create(['product_name' => $name, 'status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_id' => $item->id,
            'item_variant_id' => $variant->id,
            'pricing_matrix' => ['price' => $price],
            'active' => true,
        ]);
        $shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        app(StockService::class)->receive($variant->id, $shelf, $units);

        return $variant;
    }

    /** A cart for the customer, its lines priced the way the seller's screen prices them. */
    private function cart(?Customer $customer = null): Cart
    {
        $cart = Cart::create([
            'store_id' => $this->store->id,
            'user_id' => $this->seller->id,
            'seller_id' => $this->seller->id,
            'customer_id' => ($customer ?? $this->customer)->id,
            'status' => 'open',
        ]);
        $price = app(CartService::class)->resolveLinePrice($cart, $this->variant);
        $cart->variants()->attach($this->variant->id, ['quantity' => 2, 'price' => $price, 'store_id' => $this->store->id]);

        return $cart;
    }

    /** The seller shares it; returns the link's token. */
    private function share(Cart $cart): string
    {
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')])->actingAs($this->seller);
        $this->post(route('seller.carts.share.store', $cart))->assertSessionHas('success');

        $share = CartShare::query()->where('cart_id', $cart->id)->whereNull('revoked_at')->latest('id')->firstOrFail();

        return (string) $share->token;
    }

    /** As the customer: a guest on shared.<domain>. */
    private function asCustomer(): self
    {
        auth()->logout();
        $this->withServerVariables(['HTTP_HOST' => 'shared.'.config('app.system_domain')]);

        return $this;
    }

    #[Test]
    public function the_link_opens_its_cart_at_the_customers_own_prices_without_a_login(): void
    {
        $cart = $this->cart();
        $token = $this->share($cart);
        $sellerPrice = app(CartService::class)->resolveLinePrice($cart, $this->variant);

        $this->asCustomer()->get(route('shared.cart.show', $token))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Shared/Cart/Show')
                ->where('cart.customer', 'Abebe')
                ->where('cart.lines.0.title', 'Thermos flask')
                ->where('cart.lines.0.unit_price', fn ($price) => (float) $price === $sellerPrice)
                ->where('cart.lines.0.availability.state', 'now')
                ->where('cart.total', fn ($total) => (float) $total === round($sellerPrice * 2, 2))
                ->where('cart.accounts.0.account_number', '1000111')
                // Nothing internal: no stock figures on a line.
                ->missing('cart.lines.0.available_stock'));

        $walkIn = Cart::create(['store_id' => $this->store->id, 'seller_id' => $this->seller->id, 'status' => 'open']);
        $this->assertLessThan(app(CartService::class)->resolveLinePrice($walkIn, $this->variant), $sellerPrice, 'Their own price (210), not the store price (250).');
        $this->assertNotNull(CartShare::query()->sole()->opened_at);
    }

    #[Test]
    public function a_link_opens_only_its_own_cart_and_a_bad_old_or_revoked_link_opens_nothing(): void
    {
        $mine = $this->cart();
        $token = $this->share($mine);
        $theirs = $this->cart(Customer::factory()->create());
        $theirToken = $this->share($theirs);

        // The variant of someone else's cart cannot be touched through my link.
        $this->asCustomer()->patch(route('shared.cart.items.update', [$token, $this->other->id]), ['quantity' => 3])
            ->assertSessionHas('error', 'That item is not in this cart.');

        $this->get(route('shared.cart.show', str_repeat('x', 48)))->assertNotFound();

        // Sharing again turns the old link off.
        $fresh = $this->share($mine);
        $this->asCustomer()->get(route('shared.cart.show', $token))->assertNotFound();
        $this->get(route('shared.cart.show', $fresh))->assertOk();

        // Revoked.
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')])->actingAs($this->seller)
            ->delete(route('seller.carts.share.destroy', $theirs))->assertSessionHas('success');
        $this->asCustomer()->get(route('shared.cart.show', $theirToken))->assertNotFound();

        // Expired.
        CartShare::query()->where('cart_id', $mine->id)->whereNull('revoked_at')->update(['expires_at' => now()->subMinute()]);
        $this->get(route('shared.cart.show', $fresh))->assertNotFound();
    }

    #[Test]
    public function the_customer_changes_quantities_removes_and_adds_from_the_store_at_their_prices(): void
    {
        $cart = $this->cart();
        $token = $this->share($cart);

        $this->asCustomer()->getJson(route('shared.cart.catalogue', [$token, 'q' => 'tea']))
            ->assertOk()
            ->assertJsonPath('items.0.variant_id', $this->other->id)
            ->assertJsonPath('items.0.in_stock', true);

        $this->post(route('shared.cart.items.store', $token), ['variant_id' => $this->other->id, 'quantity' => 3])->assertSessionHas('success');
        $this->patch(route('shared.cart.items.update', [$token, $this->variant->id]), ['quantity' => 5]);

        $cart->refresh()->load('variants');
        $this->assertSame([5, 3], $cart->variants->sortBy('id')->map(fn ($v) => (int) $v->pivot->quantity)->values()->all());
        $this->assertSame(
            app(CartService::class)->resolveLinePrice($cart, $this->other),
            (float) $cart->variants->firstWhere('id', $this->other->id)->pivot->price,
            'An added line is priced by the same ladder the seller uses.',
        );
        $this->assertNotNull(CartShare::query()->sole()->customer_edited_at);

        // Zero removes.
        $this->patch(route('shared.cart.items.update', [$token, $this->other->id]), ['quantity' => 0]);
        $this->assertSame([$this->variant->id], $cart->refresh()->variants->pluck('id')->map(fn ($id) => (int) $id)->all());

        // Something not sold in this store cannot be added.
        $stranger = ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]);
        $this->post(route('shared.cart.items.store', $token), ['variant_id' => $stranger->id, 'quantity' => 1])
            ->assertSessionHas('error', 'That item is not sold in this store.');
    }

    #[Test]
    public function checkout_lands_in_the_same_order_and_payment_rows_as_a_sellers_and_the_customer_cannot_confirm(): void
    {
        $cart = $this->cart();
        $token = $this->share($cart);

        $this->asCustomer()->post(route('shared.cart.checkout', $token), [
            'delivery_method' => 'courier',
            'delivery_address' => 'Bole, house 12',
            'recipient_phone' => '0911000000',
            'payment_account_id' => $this->account->id,
        ])->assertRedirect(route('shared.cart.show', $token))->assertSessionHas('success');

        $sale = Sale::query()->sole();
        $this->assertSame($this->seller->id, (int) $sale->seller_id, 'It is the seller\'s order, on their board.');
        $this->assertSame($this->customer->id, (int) $sale->customer_id);
        $this->assertSame(Sale::STAGE_AWAITING_PAYMENT, $sale->fulfillment_stage);
        $this->assertSame('completed', $cart->refresh()->status);
        $this->assertSame('Bole, house 12', $sale->delivery?->delivery_address);

        $part = $sale->payments()->sole();
        $this->assertSame([$this->account->id, Payment::STATUS_PENDING, (float) $sale->total_amount], [(int) $part->payment_account_id, $part->status, (float) $part->amount]);

        // The link now shows the order, and the customer says they sent it.
        $this->get(route('shared.cart.show', $token))
            ->assertInertia(fn ($page) => $page->component('Shared/Cart/Order')
                ->where('order.reference', $sale->reference_number)
                ->where('order.payments.0.can_claim', true));

        $this->post(route('shared.cart.payments.claim', [$token, $part->id]), ['reference' => 'FT2610ABC'])->assertSessionHas('success');

        $part->refresh();
        $this->assertSame(Payment::STATUS_CLAIMED, $part->status);
        $this->assertNull($part->claimed_by, 'A customer is nobody who could confirm.');
        $this->assertSame(Payment::CLAIMED_VIA_CUSTOMER, $part->claimed_via);
        $this->assertSame('FT2610ABC', $part->transaction_reference);

        // The account owner sees it in their inbox, with who said it was sent, and confirms it.
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')])->actingAs($this->owner);
        $this->get(route('seller.payments.inbox'))
            ->assertInertia(fn ($page) => $page->where('payments.0.id', $part->id)->where('payments.0.claimed_by', 'The customer (shared cart)'));
        $this->post(route('seller.payments.confirm', $part))->assertSessionHas('success');

        $this->assertSame(Sale::STAGE_PICK_PACK, $sale->refresh()->fulfillment_stage);

        // After checkout the cart cannot change through the link.
        $this->asCustomer()->post(route('shared.cart.items.store', $token), ['variant_id' => $this->other->id, 'quantity' => 1])
            ->assertSessionHas('error', 'This cart is already an order.');
    }

    #[Test]
    public function only_the_stores_collection_accounts_and_pickup_needs_the_goods_in_the_store(): void
    {
        $token = $this->share($this->cart());
        $settlement = PaymentAccount::create([...$this->account->only(['store_id', 'type', 'provider', 'account_name', 'owner_user_id', 'is_active']), 'account_number' => '555', 'purpose' => PaymentAccount::PURPOSE_SETTLEMENT]);

        $this->asCustomer()->post(route('shared.cart.checkout', $token), ['delivery_method' => 'store', 'payment_account_id' => $settlement->id])
            ->assertSessionHas('error', "Choose one of the store's accounts to pay into.");
        $this->post(route('shared.cart.checkout', $token), ['delivery_method' => 'courier', 'payment_account_id' => $this->account->id])
            ->assertSessionHasErrors(['delivery_address', 'recipient_phone']);

        $this->post(route('shared.cart.checkout', $token), ['delivery_method' => 'store', 'payment_account_id' => $this->account->id])
            ->assertSessionHas('success');
        $this->assertSame('store', Sale::query()->sole()->delivery?->method);
    }

    #[Test]
    public function a_cart_needs_a_customer_and_lines_to_be_shared_and_the_seller_sees_how_far_the_customer_got(): void
    {
        $walkIn = Cart::create(['store_id' => $this->store->id, 'user_id' => $this->seller->id, 'seller_id' => $this->seller->id, 'status' => 'open']);
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')])->actingAs($this->seller);
        $this->post(route('seller.carts.share.store', $walkIn))->assertSessionHas('error', 'Choose the customer first: the link shows their prices.');

        $cart = $this->cart();
        $token = $this->share($cart);
        $shareOf = fn ($carts) => collect($carts)->firstWhere('id', $cart->id)['share'] ?? null;
        $this->get(route('seller.carts.index'))
            ->assertInertia(fn ($page) => $page->where('carts', fn ($carts) => $shareOf($carts)['stage'] === 'sent'
                && $shareOf($carts)['url'] === CartShareService::url($token)));

        $this->asCustomer()->get(route('shared.cart.show', $token));
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')])->actingAs($this->seller)
            ->get(route('seller.carts.index'))
            ->assertInertia(fn ($page) => $page->where('carts', fn ($carts) => $shareOf($carts)['stage'] === 'opened'));
    }
}
