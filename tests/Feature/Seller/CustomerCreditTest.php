<?php

declare(strict_types=1);

namespace Tests\Feature\Seller;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Finance\BalanceEntry;
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
use App\Services\CheckoutService;
use App\Services\Finance\BalanceLedger;
use App\Services\Finance\CustomerCreditService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Customer credit: set only by an admin, used at checkout within the limit,
 * blocked while an invoice is overdue, and paid back through the same
 * account-owner confirmation as any deposit.
 */
class CustomerCreditTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private User $seller;

    private User $owner;

    private Customer $customer;

    private ItemVariant $variant;

    private StoreVariant $storeVariant;

    private PaymentAccount $cbe;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['seller', 'admin'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->seller = $this->user('seller');
        $this->owner = $this->user('seller');

        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $this->storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_id' => $item->id,
            'item_variant_id' => $this->variant->id,
            'pricing_matrix' => ['price' => 100.00],
            'active' => true,
        ]);
        $shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        app(StockService::class)->receive($this->variant->id, $shelf, 500);

        $this->customer = Customer::factory()->create([
            'created_by' => $this->seller->id,
            'store_id' => $this->store->id,
            'tin_number' => null,
            'credit_limit' => 1000,
            'credit_days' => 30,
        ]);

        $this->cbe = PaymentAccount::create([
            'store_id' => $this->store->id,
            'type' => PaymentAccount::TYPE_BANK,
            'provider' => 'cbe',
            'account_number' => '1000111',
            'account_name' => 'Store',
            'owner_user_id' => $this->owner->id,
            'purpose' => PaymentAccount::PURPOSE_COLLECTION,
            'is_active' => true,
        ]);
    }

    #[Test]
    public function an_order_all_on_credit_goes_straight_to_pick_and_pack_and_is_due_in_the_customers_days(): void
    {
        $cart = $this->cart(4);
        $total = $this->total($cart);

        $this->asSeller()->post(route('seller.orders.store'), [
            'cart_id' => $cart->id,
            'parts' => [['method' => 'credit', 'amount' => $total]],
        ])->assertRedirectContains('/pick-pack');

        $sale = Sale::query()->sole();
        $this->assertSame([Sale::STAGE_PICK_PACK, 'paid'], [$sale->fulfillment_stage, $sale->payment_status]);
        $this->assertSame(now()->addDays(30)->toDateString(), $sale->due_date->toDateString());
        $this->assertSame(Payment::METHOD_CREDIT, $sale->payments()->sole()->payment_method);
        $this->assertSame(0, BalanceEntry::query()->count(), 'Credit is not money in anyone\'s hand.');
        $this->assertSame((int) round($total * 100), $this->credit()->outstandingCents($this->customer->id));
    }

    #[Test]
    public function credit_can_be_one_part_of_a_split_and_holds_the_stock_from_the_start(): void
    {
        $cart = $this->cart(8);
        $total = $this->total($cart);

        $this->asSeller()->post(route('seller.orders.store'), [
            'cart_id' => $cart->id,
            'parts' => [
                ['method' => 'credit', 'amount' => 500],
                ['payment_account_id' => $this->cbe->id, 'amount' => $total - 500],
            ],
        ])->assertRedirectContains('/pay');

        $sale = Sale::query()->sole();
        $this->assertSame([Sale::STAGE_AWAITING_PAYMENT, 'partially_paid'], [$sale->fulfillment_stage, $sale->payment_status]);
        $this->assertNull(StockReservation::query()->open()->sole()->expires_at, 'A credit order holds its stock without a clock.');
    }

    #[Test]
    public function credit_is_refused_over_the_limit_or_for_a_customer_without_it(): void
    {
        $cart = $this->cart(11);
        $total = $this->total($cart);

        $this->asSeller()->post(route('seller.orders.store'), [
            'cart_id' => $cart->id,
            'parts' => [['method' => 'credit', 'amount' => $total]],
        ])->assertSessionHas('error', fn (string $message) => str_contains($message, '1,000.00'));

        $this->customer->update(['credit_limit' => null, 'credit_days' => null]);
        $cart = $this->cart(1);

        $this->asSeller()->post(route('seller.orders.store'), [
            'cart_id' => $cart->id,
            'parts' => [['method' => 'credit', 'amount' => $this->total($cart)]],
        ])->assertSessionHas('error');

        $walkIn = $this->cart(1, customer: false);
        $this->asSeller()->post(route('seller.orders.store'), [
            'cart_id' => $walkIn->id,
            'parts' => [['method' => 'credit', 'amount' => $this->total($walkIn)]],
        ])->assertSessionHas('error');

        $this->assertSame(0, Sale::query()->count());
    }

    #[Test]
    public function an_overdue_customer_cannot_buy_on_credit_until_an_admin_lets_them_but_can_still_pay_cash(): void
    {
        $sale = $this->creditOrder(2);
        $sale->update(['due_date' => now()->subDay()->toDateString()]);
        $this->assertTrue($this->credit()->isBlocked($this->customer->fresh()));

        $cart = $this->cart(1);
        $this->asSeller()->post(route('seller.orders.store'), [
            'cart_id' => $cart->id,
            'parts' => [['method' => 'credit', 'amount' => $this->total($cart)]],
        ])->assertSessionHas('error', fn (string $message) => str_contains($message, 'overdue'));

        $this->asSeller()->post(route('seller.orders.store'), [
            'cart_id' => $cart->id,
            'parts' => [['amount' => $this->total($cart)]],
        ])->assertSessionHasNoErrors()->assertRedirectContains('/pick-pack');

        $this->asAdmin()->patch(route('admin.credit.override', $this->customer), ['credit_override' => true])->assertSessionHas('success');

        $next = $this->cart(1);
        $this->asSeller()->post(route('seller.orders.store'), [
            'cart_id' => $next->id,
            'parts' => [['method' => 'credit', 'amount' => $this->total($next)]],
        ])->assertRedirectContains('/pick-pack');
    }

    #[Test]
    public function a_cash_repayment_lowers_what_is_owed_and_lands_on_the_sellers_balance(): void
    {
        $this->creditOrder(5);
        $owed = $this->credit()->outstandingCents($this->customer->id);

        $this->asSeller()->post(route('seller.customers.repay', $this->customer), ['parts' => [['amount' => 200]]])
            ->assertSessionHas('success');

        $this->assertSame($owed - 20000, $this->credit()->outstandingCents($this->customer->id));
        $this->assertSame(20000, app(BalanceLedger::class)->heldCents($this->seller->id));
    }

    #[Test]
    public function an_account_repayment_waits_for_the_owner_like_any_deposit(): void
    {
        $this->creditOrder(5);
        $owed = $this->credit()->outstandingCents($this->customer->id);

        $this->asSeller()->post(route('seller.customers.repay', $this->customer), [
            'parts' => [['payment_account_id' => $this->cbe->id, 'amount' => 300]],
        ])->assertSessionHas('success');
        $part = Payment::query()->where('kind', Payment::KIND_REPAYMENT)->sole();
        $this->assertSame($owed, $this->credit()->outstandingCents($this->customer->id), 'Not repaid until confirmed.');

        $this->asSeller()->post(route('seller.customers.repayments.claim', [$this->customer, $part->id]))->assertSessionHas('success');
        $this->as($this->owner)->get(route('seller.payments.inbox'))
            ->assertInertia(fn ($page) => $page->where('payments.0.order', 'Credit repayment'));

        $this->as($this->owner)->post(route('seller.payments.reject', $part))->assertSessionHas('success');
        $this->asSeller()->post(route('seller.customers.repayments.claim', [$this->customer, $part->id]));
        $this->as($this->owner)->post(route('seller.payments.confirm', $part))->assertSessionHas('success');

        $this->assertSame($owed - 30000, $this->credit()->outstandingCents($this->customer->id));
        $this->assertSame(30000, app(BalanceLedger::class)->heldCents($this->owner->id));
    }

    #[Test]
    public function a_repayment_cannot_be_more_than_is_owed_or_already_on_its_way(): void
    {
        $this->creditOrder(2);
        $owed = $this->credit()->outstandingCents($this->customer->id) / 100;

        $this->asSeller()->post(route('seller.customers.repay', $this->customer), ['parts' => [['amount' => $owed + 1]]])
            ->assertSessionHas('error');

        $this->asSeller()->post(route('seller.customers.repay', $this->customer), [
            'parts' => [['payment_account_id' => $this->cbe->id, 'amount' => $owed]],
        ])->assertSessionHas('success');

        $this->asSeller()->post(route('seller.customers.repay', $this->customer), ['parts' => [['amount' => 1]]])
            ->assertSessionHas('error');

        // Removing the pending part frees it up again.
        $part = Payment::query()->where('kind', Payment::KIND_REPAYMENT)->sole();
        $this->asSeller()->post(route('seller.customers.repayments.void', [$this->customer, $part->id]))->assertSessionHas('success');
        $this->asSeller()->post(route('seller.customers.repay', $this->customer), ['parts' => [['amount' => 1]]])
            ->assertSessionHas('success');
    }

    #[Test]
    public function repayments_pay_off_the_oldest_invoice_first(): void
    {
        $old = $this->creditOrder(2);
        $new = $this->creditOrder(3);
        $old->update(['due_date' => now()->subDays(2)->toDateString()]);
        $new->update(['due_date' => now()->subDay()->toDateString()]);
        $oldOwed = (float) $old->payments()->sum('amount');

        $this->asSeller()->post(route('seller.customers.repay', $this->customer), ['parts' => [['amount' => $oldOwed]]]);

        $invoices = collect($this->credit()->invoices($this->customer->id))->keyBy('sale_id');
        $this->assertSame(0.0, (float) $invoices[$old->id]['owed']);
        $this->assertTrue($invoices[$new->id]['overdue']);

        $this->asSeller()->post(route('seller.customers.repay', $this->customer), ['parts' => [['amount' => (float) $new->payments()->sum('amount')]]]);
        $this->assertFalse($this->credit()->isBlocked($this->customer->fresh()));
    }

    #[Test]
    public function cancelling_a_credit_order_takes_it_off_what_is_owed(): void
    {
        $sale = $this->creditOrder(2);

        $this->asSeller()->post(route('seller.orders.cancel', ['reference' => $sale->reference_number]))->assertSessionHasNoErrors();

        $this->assertSame(0, $this->credit()->outstandingCents($this->customer->id));
    }

    #[Test]
    public function a_seller_can_never_set_credit_on_a_customer(): void
    {
        $this->asSeller()->post(route('seller.customers.store'), [
            'first_name' => 'Kebede',
            'email' => 'kebede@example.com',
            'phone_number' => '0911000001',
            'credit_limit' => 50000,
            'credit_days' => 60,
        ])->assertSessionHasErrors(['credit_limit', 'credit_days']);
        $this->assertNull(Customer::query()->where('email', 'kebede@example.com')->first());

        $this->asSeller()->put(route('seller.customers.update', $this->customer), [
            'first_name' => 'Changed',
            'email' => $this->customer->email,
            'phone_number' => $this->customer->phone_number,
            'credit_limit' => 999999,
            'credit_override' => true,
        ])->assertSessionHasErrors(['credit_limit', 'credit_override']);

        $fresh = $this->customer->fresh();
        $this->assertSame([1000.0, false, $this->customer->first_name], [(float) $fresh->credit_limit, $fresh->credit_override, $fresh->first_name]);

        // A plain edit still works, and leaves the credit alone.
        $this->asSeller()->put(route('seller.customers.update', $this->customer), [
            'first_name' => 'Changed',
            'email' => $this->customer->email,
            'phone_number' => $this->customer->phone_number,
        ])->assertSessionHasNoErrors();
        $this->assertSame(1000.0, (float) $this->customer->fresh()->credit_limit);
    }

    #[Test]
    public function the_seller_sees_the_customers_credit_but_only_an_admin_sets_it(): void
    {
        $this->creditOrder(2);

        $this->asSeller()->get(route('seller.customers.show', $this->customer))
            ->assertInertia(fn ($page) => $page
                ->where('credit.limit', 1000)
                ->where('credit.blocked_reason', null)
                ->where('invoices', fn ($rows) => count($rows) === 1));

        $this->asAdmin()->put(route('admin.customers.update', $this->customer), [
            'first_name' => $this->customer->first_name,
            'email' => $this->customer->email,
            'phone_number' => $this->customer->phone_number,
            'credit_limit' => 5000,
        ])->assertSessionHasErrors('credit_days');

        $this->asAdmin()->put(route('admin.customers.update', $this->customer), [
            'first_name' => $this->customer->first_name,
            'email' => $this->customer->email,
            'phone_number' => $this->customer->phone_number,
            'credit_limit' => 5000,
            'credit_days' => 14,
        ])->assertSessionHasNoErrors();

        $this->assertSame([5000.0, 14], [(float) $this->customer->fresh()->credit_limit, $this->customer->fresh()->credit_days]);

        $this->asAdmin()->get(route('admin.credit.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Payments/Credit')->where('customers.0.customer_id', $this->customer->id));
    }

    #[Test]
    public function checkout_shows_the_customers_credit(): void
    {
        $this->asSeller()->get(route('seller.orders.confirmation', ['cart' => $this->cart(1)->id]))
            ->assertInertia(fn ($page) => $page->where('credit.available', 1000)->where('credit.days', 30));

        $this->asSeller()->get(route('seller.orders.confirmation', ['cart' => $this->cart(1, customer: false)->id]))
            ->assertInertia(fn ($page) => $page->where('credit', null));
    }

    private function creditOrder(int $quantity): Sale
    {
        $cart = $this->cart($quantity);

        $this->asSeller()->post(route('seller.orders.store'), [
            'cart_id' => $cart->id,
            'parts' => [['method' => 'credit', 'amount' => $this->total($cart)]],
        ])->assertSessionHasNoErrors();

        return Sale::query()->latest('id')->firstOrFail();
    }

    /** What checkout will charge for the cart. */
    private function total(Cart $cart): float
    {
        $unit = app(CheckoutService::class)->unitPrice($cart->fresh(['customer']), $this->storeVariant, 100);

        return round($unit * (int) $cart->variants()->first()->pivot->quantity, 2);
    }

    private function cart(int $quantity, bool $customer = true): Cart
    {
        $cart = Cart::create([
            'store_id' => $this->store->id,
            'user_id' => $this->seller->id,
            'seller_id' => $this->seller->id,
            'customer_id' => $customer ? $this->customer->id : null,
            'status' => 'open',
        ]);
        $cart->variants()->attach($this->variant->id, ['quantity' => $quantity, 'price' => 100, 'store_id' => $this->store->id]);

        return $cart;
    }

    private function credit(): CustomerCreditService
    {
        return app(CustomerCreditService::class);
    }

    private function user(string $role): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $this->store->id]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function as(User $user, string $subdomain = 'seller'): self
    {
        $this->withServerVariables(['HTTP_HOST' => $subdomain.'.'.config('app.system_domain')]);
        $this->actingAs($user, 'web');

        return $this;
    }

    private function asSeller(): self
    {
        return $this->as($this->seller);
    }

    private function asAdmin(): self
    {
        $admin = User::query()->where('role', 'admin')->first() ?? $this->user('admin');

        return $this->as($admin, 'admin');
    }
}
