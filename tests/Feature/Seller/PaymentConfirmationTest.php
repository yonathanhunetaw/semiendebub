<?php

declare(strict_types=1);

namespace Tests\Feature\Seller;

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
 * Splitting an order's total across the store's accounts and cash, and the
 * owner of each account confirming the money arrived before the order moves
 * on to Pick & Pack.
 */
class PaymentConfirmationTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private User $seller;

    private User $owner;

    private ItemVariant $variant;

    private PaymentAccount $cbeOne;

    private PaymentAccount $cbeTwo;

    private PaymentAccount $telebirr;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['name' => 'seller']);

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->seller = $this->user($this->store->id);
        $this->owner = $this->user($this->store->id);

        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_id' => $item->id,
            'item_variant_id' => $this->variant->id,
            'pricing_matrix' => ['price' => 250.00],
            'active' => true,
        ]);
        $shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        app(StockService::class)->receive($this->variant->id, $shelf, 50);

        // Two accounts at the same bank, and a wallet.
        $this->cbeOne = $this->account('cbe', PaymentAccount::TYPE_BANK, '1000111');
        $this->cbeTwo = $this->account('cbe', PaymentAccount::TYPE_BANK, '1000222');
        $this->telebirr = $this->account('telebirr', PaymentAccount::TYPE_WALLET, '0912000000');
    }

    #[Test]
    public function a_total_splits_across_the_same_bank_twice_a_wallet_and_cash(): void
    {
        // 4 × 250 = 1,000
        $this->place(4, [
            ['payment_account_id' => $this->cbeOne->id, 'amount' => 300],
            ['payment_account_id' => $this->cbeTwo->id, 'amount' => 300],
            ['payment_account_id' => $this->telebirr->id, 'amount' => 250],
            ['amount' => 150],
        ])->assertRedirectContains('/pay');

        $sale = Sale::query()->sole();
        $this->assertSame(Sale::STAGE_AWAITING_PAYMENT, $sale->fulfillment_stage);
        $this->assertSame('partially_paid', $sale->payment_status, 'The cash part is in hand.');
        $this->assertSame(
            [Payment::STATUS_PENDING, Payment::STATUS_PENDING, Payment::STATUS_PENDING, Payment::STATUS_CONFIRMED],
            $sale->payments()->orderBy('id')->pluck('status')->all(),
        );
    }

    #[Test]
    public function parts_that_do_not_add_up_to_the_total_are_refused_and_nothing_is_placed(): void
    {
        $this->place(4, [
            ['payment_account_id' => $this->cbeOne->id, 'amount' => 500],
            ['amount' => 400],
        ])->assertSessionHas('error', fn (string $message) => str_contains($message, '900.00') && str_contains($message, '1,000.00'));

        $this->assertSame(0, Sale::query()->count());
        $this->assertSame(0, StockReservation::query()->count());
        $this->assertNotSame('completed', Cart::query()->sole()->status, 'The cart stays open to try again.');
    }

    #[Test]
    public function only_active_collection_accounts_of_the_sellers_own_store_can_be_used(): void
    {
        $elsewhere = PaymentAccount::create([
            ...$this->cbeOne->only(['type', 'provider', 'account_name', 'owner_user_id', 'purpose', 'is_active']),
            'account_number' => '9999',
            'store_id' => Store::factory()->create(['type' => Store::TYPE_RETAIL])->id,
        ]);
        $off = $this->account('awash', PaymentAccount::TYPE_BANK, '777', ['is_active' => false]);
        $settlement = $this->account('dashen', PaymentAccount::TYPE_BANK, '888', ['purpose' => PaymentAccount::PURPOSE_SETTLEMENT]);

        $this->asSeller()
            ->get(route('seller.orders.confirmation', ['cart' => $this->cart(1)->id]))
            ->assertInertia(fn ($page) => $page->where('accounts', fn ($accounts) => collect($accounts)->pluck('id')->sort()->values()->all()
                === collect([$this->cbeOne->id, $this->cbeTwo->id, $this->telebirr->id])->sort()->values()->all()));

        foreach ([$elsewhere, $off, $settlement] as $account) {
            $this->place(1, [['payment_account_id' => $account->id, 'amount' => 250]])->assertSessionHas('error');
        }

        $this->assertSame(0, Sale::query()->count());
    }

    #[Test]
    public function the_order_moves_on_only_once_every_part_is_confirmed_by_its_owner(): void
    {
        $this->place(4, [
            ['payment_account_id' => $this->cbeOne->id, 'amount' => 600],
            ['payment_account_id' => $this->telebirr->id, 'amount' => 400],
        ]);
        $sale = Sale::query()->sole();
        [$bank, $wallet] = $sale->payments()->orderBy('id')->get()->all();

        $this->claim($sale, $bank)->assertSessionHas('success');
        $this->claim($sale, $wallet)->assertSessionHas('success');

        $this->asOwner()->post(route('seller.payments.confirm', $bank))->assertSessionHas('success');
        $sale->refresh();
        $this->assertSame([Sale::STAGE_AWAITING_PAYMENT, 'partially_paid'], [$sale->fulfillment_stage, $sale->payment_status]);

        $this->asOwner()->post(route('seller.payments.confirm', $wallet))->assertSessionHas('success');
        $sale->refresh();
        $this->assertSame([Sale::STAGE_PICK_PACK, 'paid'], [$sale->fulfillment_stage, $sale->payment_status]);
        $this->assertSame($this->owner->id, (int) $wallet->fresh()->confirmed_by);
    }

    #[Test]
    public function not_received_yet_sends_the_part_back_and_the_seller_sees_it(): void
    {
        $this->place(2, [['payment_account_id' => $this->cbeOne->id, 'amount' => 500]]);
        $sale = Sale::query()->sole();
        $part = $sale->payments()->sole();

        $this->claim($sale, $part);
        $this->asOwner()->get(route('seller.payments.inbox'))
            ->assertInertia(fn ($page) => $page->where('payments', fn ($rows) => count($rows) === 1));

        $this->asOwner()->post(route('seller.payments.reject', $part))->assertSessionHas('success');

        $this->assertSame(Payment::STATUS_PENDING, $part->fresh()->status);
        $this->asOwner()->get(route('seller.payments.inbox'))
            ->assertInertia(fn ($page) => $page->where('payments', []));
        $this->asSeller()->get(route('seller.orders.pay', ['reference' => $sale->reference_number]))
            ->assertInertia(fn ($page) => $page->where('order.payments.0.not_received_at', fn ($at) => $at !== null));

        // The customer tries again: claimed, then confirmed.
        $this->claim($sale, $part)->assertSessionHas('success');
        $this->asOwner()->post(route('seller.payments.confirm', $part))->assertSessionHas('success');
        $this->assertSame(Sale::STAGE_PICK_PACK, $sale->fresh()->fulfillment_stage);
    }

    #[Test]
    public function only_the_accounts_owner_may_confirm_or_reject(): void
    {
        $this->place(2, [['payment_account_id' => $this->cbeOne->id, 'amount' => 500]]);
        $sale = Sale::query()->sole();
        $part = $sale->payments()->sole();
        $this->claim($sale, $part);

        $this->asSeller()->post(route('seller.payments.confirm', $part))->assertForbidden();
        $this->asSeller()->post(route('seller.payments.reject', $part))->assertForbidden();

        $this->assertSame(Payment::STATUS_CLAIMED, $part->fresh()->status);
        $this->assertSame(Sale::STAGE_AWAITING_PAYMENT, $sale->fresh()->fulfillment_stage);
    }

    #[Test]
    public function the_owner_may_be_the_seller_who_made_the_sale(): void
    {
        $mine = $this->account('awash', PaymentAccount::TYPE_BANK, '555', ['owner_user_id' => $this->seller->id]);

        $this->place(1, [['payment_account_id' => $mine->id, 'amount' => 250]]);
        $sale = Sale::query()->sole();
        $part = $sale->payments()->sole();

        $this->claim($sale, $part);
        $this->asSeller()->post(route('seller.payments.confirm', $part))->assertSessionHas('success');

        $this->assertSame(Sale::STAGE_PICK_PACK, $sale->fresh()->fulfillment_stage);
    }

    #[Test]
    public function a_part_cannot_be_confirmed_before_the_customer_says_they_paid(): void
    {
        $this->place(1, [['payment_account_id' => $this->cbeOne->id, 'amount' => 250]]);
        $part = Payment::query()->sole();

        $this->asOwner()->post(route('seller.payments.confirm', $part))->assertSessionHas('error');
        $this->assertSame(Payment::STATUS_PENDING, $part->fresh()->status);
    }

    #[Test]
    public function an_unclaimed_order_holds_stock_for_48_hours_and_a_claim_stops_the_clock(): void
    {
        $this->place(2, [['payment_account_id' => $this->cbeOne->id, 'amount' => 500]]);
        $sale = Sale::query()->sole();

        $expires = StockReservation::query()->open()->sole()->expires_at;
        $this->assertTrue($expires->between(now()->addHours(47), now()->addHours(48)->addMinute()));

        $this->claim($sale, $sale->payments()->sole());
        $this->assertNull(StockReservation::query()->open()->sole()->expires_at);
    }

    #[Test]
    public function re_splitting_replaces_pending_parts_and_keeps_claimed_ones(): void
    {
        $this->place(4, [
            ['payment_account_id' => $this->cbeOne->id, 'amount' => 600],
            ['payment_account_id' => $this->cbeTwo->id, 'amount' => 400],
        ]);
        $sale = Sale::query()->sole();
        [$claimed, $pending] = $sale->payments()->orderBy('id')->get()->all();
        $this->claim($sale, $claimed);

        // The customer will send the other 400 by wallet and cash instead.
        $this->asSeller()
            ->put(route('seller.orders.payments.update', ['reference' => $sale->reference_number]), ['parts' => [
                ['payment_account_id' => $this->telebirr->id, 'amount' => 300],
                ['amount' => 100],
            ]])
            ->assertSessionHas('success');

        $this->assertNull(Payment::query()->find($pending->id));
        $this->assertSame(Payment::STATUS_CLAIMED, $claimed->fresh()->status);
        $this->assertEqualsWithDelta(1000, (float) $sale->payments()->live()->sum('amount'), 0.001);

        // The new parts must make up exactly what the claimed one leaves.
        $this->asSeller()
            ->put(route('seller.orders.payments.update', ['reference' => $sale->reference_number]), ['parts' => [['amount' => 1000]]])
            ->assertSessionHas('error');
    }

    #[Test]
    public function cancelling_voids_parts_whose_money_never_arrived(): void
    {
        $this->place(2, [
            ['payment_account_id' => $this->cbeOne->id, 'amount' => 300],
            ['amount' => 200],
        ]);
        $sale = Sale::query()->sole();

        $this->asSeller()->post(route('seller.orders.cancel', ['reference' => $sale->reference_number]))->assertSessionHasNoErrors();

        $this->assertSame(
            [Payment::STATUS_VOID, Payment::STATUS_CONFIRMED],
            $sale->payments()->orderBy('id')->pluck('status')->all(),
        );
    }

    #[Test]
    public function the_more_hub_counts_deposits_waiting_on_the_owner(): void
    {
        $this->place(2, [
            ['payment_account_id' => $this->cbeOne->id, 'amount' => 300],
            ['payment_account_id' => $this->telebirr->id, 'amount' => 200],
        ]);
        $sale = Sale::query()->sole();
        $sale->payments->each(fn (Payment $part) => $this->claim($sale, $part));

        $this->asOwner()->get(route('seller.menu.index'))
            ->assertInertia(fn ($page) => $page->where('stats.payments_to_confirm', 2));
        $this->asSeller()->get(route('seller.menu.index'))
            ->assertInertia(fn ($page) => $page->where('stats.payments_to_confirm', 0));
    }

    #[Test]
    public function another_stores_seller_cannot_claim_a_part(): void
    {
        $this->place(1, [['payment_account_id' => $this->cbeOne->id, 'amount' => 250]]);
        $sale = Sale::query()->sole();
        $outsider = $this->user(Store::factory()->create(['type' => Store::TYPE_RETAIL])->id);

        $this->actingAs($outsider)
            ->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')])
            ->post(route('seller.orders.payments.claim', ['reference' => $sale->reference_number, 'payment' => $sale->payments()->sole()->id]))
            ->assertNotFound();
    }

    private function place(int $quantity, array $parts): \Illuminate\Testing\TestResponse
    {
        return $this->asSeller()->post(route('seller.orders.store'), ['cart_id' => $this->cart($quantity)->id, 'parts' => $parts]);
    }

    private function claim(Sale $sale, Payment $part): \Illuminate\Testing\TestResponse
    {
        return $this->asSeller()->post(route('seller.orders.payments.claim', ['reference' => $sale->reference_number, 'payment' => $part->id]));
    }

    /** @param array<string, mixed> $overrides */
    private function account(string $provider, string $type, string $number, array $overrides = []): PaymentAccount
    {
        return PaymentAccount::create([
            'store_id' => $this->store->id,
            'type' => $type,
            'provider' => $provider,
            'account_number' => $number,
            'account_name' => 'Store account',
            'owner_user_id' => $this->owner->id,
            'purpose' => PaymentAccount::PURPOSE_COLLECTION,
            'is_active' => true,
            ...$overrides,
        ]);
    }

    private function cart(int $quantity): Cart
    {
        $cart = Cart::create([
            'store_id' => $this->store->id,
            'user_id' => $this->seller->id,
            'seller_id' => $this->seller->id,
            'status' => 'open',
        ]);
        $cart->variants()->attach($this->variant->id, ['quantity' => $quantity, 'price' => 250, 'store_id' => $this->store->id]);

        return $cart;
    }

    private function user(?int $storeId): User
    {
        $user = User::factory()->create(['role' => 'seller', 'store_id' => $storeId]);
        $user->assignRole('seller');

        return $user->refresh();
    }

    private function asSeller(): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);
        $this->actingAs($this->seller, 'web');

        return $this;
    }

    private function asOwner(): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);
        $this->actingAs($this->owner, 'web');

        return $this;
    }
}
