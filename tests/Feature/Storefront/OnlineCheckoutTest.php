<?php

declare(strict_types=1);

namespace Tests\Feature\Storefront;

use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\StockReservation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The online shop's checkout: a signed-in shopper's cart becomes an order the
 * store works like a seller's, paid by transfer into one of the store's
 * accounts and confirmed by that account's owner. Then My orders.
 */
class OnlineCheckoutTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private User $owner;

    private User $shopper;

    private PaymentAccount $account;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        Role::firstOrCreate(['name' => 'seller']);
        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL, 'status' => 'active']);
        config(['storefront.store_id' => $this->store->id]);

        $this->owner = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id, 'first_name' => 'Sara', 'last_name' => 'Owner']);
        $this->owner->assignRole('seller');

        $this->account = $this->account($this->store, $this->owner, '1000111');
        $this->variant = $this->stocked($this->store, 'Thermos flask', 250.0, 10);

        $this->shopper = User::factory()->create(['role' => 'user', 'first_name' => 'Abebe', 'last_name' => 'Kebede', 'phone_number' => '0911222333']);
    }

    private function account(Store $store, User $owner, string $number): PaymentAccount
    {
        return PaymentAccount::create([
            'store_id' => $store->id, 'type' => PaymentAccount::TYPE_BANK, 'provider' => 'cbe',
            'account_number' => $number, 'account_name' => $store->name, 'owner_user_id' => $owner->id,
            'purpose' => PaymentAccount::PURPOSE_COLLECTION, 'is_active' => true,
        ]);
    }

    private function stocked(Store $store, string $name, float $price, int $units): ItemVariant
    {
        $item = Item::factory()->create(['product_name' => $name, 'status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id' => $store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id, 'active' => true,
            'pricing_matrix' => ['price' => $price, 'discount_price' => null, 'discount_ends_at' => null],
        ]);
        $shelf = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        app(StockService::class)->receive($variant->id, $shelf, $units);

        return $variant;
    }

    private function inCart(int $quantity = 2): void
    {
        $this->actingAs($this->shopper)->post(route('storefront.cart.items.store'), ['variant_id' => $this->variant->id, 'quantity' => $quantity])
            ->assertSessionHas('success');
    }

    /** @param  array<string, mixed>  $overrides */
    private function place(array $overrides = [])
    {
        return $this->actingAs($this->shopper)->post(route('storefront.checkout.place'), $overrides + [
            'stores' => [['store_id' => $this->store->id, 'payment_account_id' => $this->account->id]],
            'delivery_method' => 'courier',
            'delivery_address' => 'Bole, house 12',
            'recipient_name' => 'Abebe Kebede',
            'recipient_phone' => '0911222333',
        ]);
    }

    #[Test]
    public function the_checkout_page_shows_the_cart_the_accounts_and_who_receives_it(): void
    {
        $this->inCart(2);

        $this->get(route('storefront.checkout.show'))->assertOk()->assertInertia(fn ($page) => $page
            ->component('User/Checkout/Index')
            ->has('stores', 1)
            ->where('stores.0.store.name', 'Main Store')
            ->where('stores.0.total', 500)
            ->where('stores.0.lines.0.quantity', 2)
            ->has('stores.0.accounts', 1)
            ->where('stores.0.accounts.0.account_number', '1000111')
            ->where('recipient.name', 'Abebe Kebede')
            ->where('recipient.phone', '0911222333')
            ->where('hold_minutes', (int) config('inventory.unpaid_reservation_minutes')));
    }

    #[Test]
    public function a_guest_is_sent_to_sign_in_and_an_empty_cart_goes_back_to_the_shop(): void
    {
        $this->get(route('storefront.checkout.show'))->assertRedirect(route('login'));
        $this->get(route('storefront.orders.index'))->assertRedirect(route('login'));

        $this->actingAs($this->shopper)->get(route('storefront.checkout.show'))
            ->assertRedirect(route('storefront.index'))->assertSessionHas('error', 'Your cart is empty.');
    }

    #[Test]
    public function placing_it_makes_the_account_owners_order_at_the_shop_price_waiting_for_the_transfer(): void
    {
        $this->inCart(2);

        $this->place()->assertSessionHasNoErrors()->assertRedirect();
        $sale = Sale::query()->sole();

        $this->assertSame($this->shopper->id, (int) $sale->shopper_id);
        $this->assertSame($this->owner->id, (int) $sale->seller_id, 'The order is the account owner\'s, on their board.');
        $this->assertNull($sale->customer_id, 'Retail: no CRM customer, so the shop\'s price stands.');
        $this->assertSame(500.0, (float) $sale->total_amount);
        $this->assertSame(Sale::STAGE_AWAITING_PAYMENT, $sale->fulfillment_stage);
        $this->assertStringContainsString('Online order · Abebe Kebede · 0911222333', (string) $sale->notes);
        $this->assertSame('Bole, house 12', $sale->delivery?->delivery_address);
        $this->assertSame('0911222333', $sale->delivery?->recipient_phone);
        $this->assertSame('completed', Cart::query()->where('user_id', $this->shopper->id)->sole()->status);
        $this->assertSame('Online · Abebe Kebede', $sale->customerLabel());

        $part = $sale->payments()->sole();
        $this->assertSame([$this->account->id, Payment::STATUS_PENDING, 500.0], [(int) $part->payment_account_id, $part->status, (float) $part->amount]);

        // The stock is held until it is paid, for the business rule's time.
        $hold = StockReservation::query()->open()->sole();
        $this->assertSame(2, (int) $hold->quantity);
        $this->assertNotNull($hold->expires_at);
    }

    #[Test]
    public function the_shopper_says_it_is_sent_and_the_account_owner_confirms_it_as_for_any_transfer(): void
    {
        $this->inCart(1);
        $this->place();
        $sale = Sale::query()->sole();
        $part = $sale->payments()->sole();

        $this->get(route('storefront.orders.show', $sale->reference_number))->assertOk()->assertInertia(fn ($page) => $page
            ->component('User/Orders/Show')
            ->where('order.reference', $sale->reference_number)
            ->where('order.stage', 'to_pay')
            ->where('order.payments.0.can_claim', true)
            ->where('order.can_cancel', true)
            ->where('order.hold_minutes_left', fn ($minutes) => $minutes > 0));

        $this->post(route('storefront.orders.claim', [$sale->reference_number, $part->id]), ['reference' => 'FT2610ABC'])->assertSessionHas('success');

        $part->refresh();
        $this->assertSame(Payment::STATUS_CLAIMED, $part->status);
        $this->assertNull($part->claimed_by, 'A shopper is nobody who could confirm.');
        $this->assertSame(Payment::CLAIMED_VIA_CUSTOMER, $part->claimed_via);
        $this->assertSame('FT2610ABC', $part->transaction_reference);

        // Money is on its way: no cancelling from the shop any more.
        $this->get(route('storefront.orders.show', $sale->reference_number))->assertInertia(fn ($page) => $page->where('order.can_cancel', false));
        $this->post(route('storefront.orders.cancel', $sale->reference_number))->assertSessionHas('error');

        // The owner's inbox names the online shopper, and the owner confirms it.
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')])->actingAs($this->owner);
        $this->get(route('seller.payments.inbox'))
            ->assertInertia(fn ($page) => $page->where('payments.0.id', $part->id)->where('payments.0.customer', 'Online · Abebe Kebede'));
        $this->post(route('seller.payments.confirm', $part))->assertSessionHas('success');

        $this->assertSame(Sale::STAGE_PICK_PACK, $sale->refresh()->fulfillment_stage);
    }

    #[Test]
    public function my_orders_lists_only_the_shoppers_own_and_hides_the_rest(): void
    {
        $this->inCart(1);
        $this->place();
        $sale = Sale::query()->sole();

        $this->get(route('storefront.orders.index'))->assertOk()->assertInertia(fn ($page) => $page
            ->component('User/Orders/Index')
            ->has('orders', 1)
            ->where('orders.0.reference', $sale->reference_number)
            ->where('orders.0.to_pay', true));

        $someoneElse = User::factory()->create(['role' => 'user']);
        $this->actingAs($someoneElse)->get(route('storefront.orders.index'))->assertInertia(fn ($page) => $page->has('orders', 0));
        $this->actingAs($someoneElse)->get(route('storefront.orders.show', $sale->reference_number))->assertNotFound();
        $this->actingAs($someoneElse)->post(route('storefront.orders.claim', [$sale->reference_number, $sale->payments()->sole()->id]), ['reference' => 'XYZ123'])->assertNotFound();
        $this->actingAs($someoneElse)->post(route('storefront.orders.cancel', $sale->reference_number))->assertNotFound();
    }

    #[Test]
    public function a_counter_sale_is_never_an_online_order(): void
    {
        $this->inCart(1);
        $this->place();
        $sale = Sale::query()->sole();
        $sale->update(['shopper_id' => null]);

        $this->actingAs($this->shopper)->get(route('storefront.orders.show', $sale->reference_number))->assertNotFound();
    }

    #[Test]
    public function an_unpaid_order_can_be_cancelled_and_its_stock_goes_back(): void
    {
        $this->inCart(3);
        $this->place();
        $sale = Sale::query()->sole();
        $this->assertSame(1, StockReservation::query()->open()->count());

        $this->post(route('storefront.orders.cancel', $sale->reference_number))->assertSessionHas('success');

        $sale->refresh();
        $this->assertSame(Sale::STAGE_CANCELLED, $sale->fulfillment_stage);
        $this->assertSame(0, StockReservation::query()->open()->count());
        $this->assertSame(Payment::STATUS_VOID, $sale->payments()->sole()->status);
    }

    #[Test]
    public function the_account_must_be_one_of_the_stores_collection_accounts(): void
    {
        $this->inCart(1);
        $elsewhere = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $foreign = $this->account($elsewhere, $this->owner, '999');
        $settlement = PaymentAccount::create([...$this->account->only(['store_id', 'type', 'provider', 'account_name', 'owner_user_id', 'is_active']), 'account_number' => '555', 'purpose' => PaymentAccount::PURPOSE_SETTLEMENT]);

        foreach ([$foreign, $settlement] as $wrong) {
            $this->place(['stores' => [['store_id' => $this->store->id, 'payment_account_id' => $wrong->id]]])
                ->assertSessionHas('error', "Choose one of Main Store's accounts to pay into.");
        }

        $this->assertSame(0, Sale::query()->count());
        $this->assertSame('pending', Cart::query()->where('user_id', $this->shopper->id)->sole()->status, 'Nothing was placed, so the cart is still there.');
    }

    #[Test]
    public function the_form_needs_an_address_for_a_courier_and_a_phone_always(): void
    {
        $this->inCart(1);

        $this->place(['delivery_address' => '', 'recipient_phone' => ''])->assertSessionHasErrors(['delivery_address', 'recipient_phone']);
        $this->place(['stores' => []])->assertSessionHasErrors('stores');

        // Pickup needs no address.
        $this->place(['delivery_method' => 'store', 'delivery_address' => ''])->assertSessionHasNoErrors();
        $this->assertSame('store', Sale::query()->sole()->delivery?->method);
    }

    #[Test]
    public function a_basket_across_two_stores_becomes_two_orders_or_none(): void
    {
        $second = Store::factory()->create(['name' => 'Piassa Store', 'slug' => 'piassa', 'type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $secondOwner = User::factory()->create(['role' => 'seller', 'store_id' => $second->id]);
        $secondAccount = $this->account($second, $secondOwner, '2000222');
        $glass = $this->stocked($second, 'Tea glass set', 100.0, 5);

        $this->inCart(1);
        $this->actingAs($this->shopper)->post(route('storefront.cart.items.store'), ['store' => 'piassa', 'variant_id' => $glass->id, 'quantity' => 2])->assertSessionHas('success');

        // One account wrong: nothing is placed anywhere.
        $this->place(['stores' => [
            ['store_id' => $this->store->id, 'payment_account_id' => $this->account->id],
            ['store_id' => $second->id, 'payment_account_id' => $this->account->id],
        ]])->assertSessionHas('error');
        $this->assertSame(0, Sale::query()->count());

        $this->place(['stores' => [
            ['store_id' => $this->store->id, 'payment_account_id' => $this->account->id],
            ['store_id' => $second->id, 'payment_account_id' => $secondAccount->id],
        ]])->assertRedirect(route('storefront.orders.index'));

        $sales = Sale::query()->orderBy('id')->get();
        $this->assertCount(2, $sales);
        $this->assertSame([$this->owner->id, $secondOwner->id], $sales->pluck('seller_id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame([250.0, 200.0], $sales->pluck('total_amount')->map(fn ($t) => (float) $t)->all());

        // Only one store's cart: ?store= narrows the page to it (now empty: both were placed).
        $this->get(route('storefront.checkout.show', ['store' => 'piassa']))->assertRedirect(route('storefront.index'));
    }

    #[Test]
    public function the_shop_bar_and_menu_link_to_my_orders_instead_of_an_inert_messages(): void
    {
        foreach (['Components/Navigation/User/UserBottomNav.tsx', 'Components/Storefront/StorefrontMenuDrawer.tsx'] as $file) {
            $source = (string) file_get_contents(resource_path('js/'.$file));
            $this->assertStringContainsString('storefront.orders.index', $source, $file);
            $this->assertStringNotContainsString('label="Messages"', $source, $file);
        }
    }
}
