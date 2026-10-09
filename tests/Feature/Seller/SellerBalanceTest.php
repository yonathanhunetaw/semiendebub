<?php

declare(strict_types=1);

namespace Tests\Feature\Seller;

use App\Models\Auth\User;
use App\Models\Finance\BalanceEntry;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Remittance;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Finance\BalanceLedger;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The seller balance: confirmed deposits and cash land on the confirmer's
 * balance, and leave it when a settlement account's owner confirms the
 * handover.
 */
class SellerBalanceTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    /** Takes orders and cash. */
    private User $seller;

    /** Owns the store's CBE collection account. */
    private User $owner;

    /** Owns the settlement account takings are handed over to. */
    private User $boss;

    private ItemVariant $variant;

    private PaymentAccount $cbe;

    private PaymentAccount $settlement;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['name' => 'seller']);

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->seller = $this->user();
        $this->owner = $this->user();
        $this->boss = $this->user();

        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_id' => $item->id,
            'item_variant_id' => $this->variant->id,
            'pricing_matrix' => ['price' => 100.00],
            'active' => true,
        ]);
        $shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        app(StockService::class)->receive($this->variant->id, $shelf, 100);

        $this->cbe = $this->account('cbe', $this->owner, PaymentAccount::PURPOSE_COLLECTION);
        $this->settlement = $this->account('dashen', $this->boss, PaymentAccount::PURPOSE_SETTLEMENT);
        $this->settlement->remitters()->sync([$this->seller->id, $this->owner->id]);
    }

    #[Test]
    public function a_confirmed_deposit_lands_on_the_owners_balance_and_cash_on_the_sellers(): void
    {
        $this->paidOrder(3, [['payment_account_id' => $this->cbe->id, 'amount' => 200], ['amount' => 100]]);

        $this->assertSame(20000, $this->ledger()->heldCents($this->owner->id));
        $this->assertSame(10000, $this->ledger()->heldCents($this->seller->id));
        $this->assertSame(0, $this->ledger()->heldCents($this->boss->id));

        $this->as($this->owner)->get(route('seller.balance.index'))
            ->assertInertia(fn ($page) => $page
                ->component('Seller/Balance/Index')
                ->where('held', 200)
                ->where('buckets.0.account.id', $this->cbe->id)
                ->where('buckets.0.available', 200)
                ->where('settlement_accounts.0.id', $this->settlement->id));

        $this->as($this->seller)->get(route('seller.balance.index'))
            ->assertInertia(fn ($page) => $page->where('buckets.0.account', null)->where('buckets.0.held', 100));
    }

    #[Test]
    public function an_unconfirmed_deposit_is_not_on_anyones_balance(): void
    {
        $this->as($this->seller)->post(route('seller.orders.store'), [
            'cart_id' => $this->cart(2)->id,
            'parts' => [['payment_account_id' => $this->cbe->id, 'amount' => 200]],
        ]);
        $sale = Sale::query()->sole();
        $this->as($this->seller)->post(route('seller.orders.payments.claim', ['reference' => $sale->reference_number, 'payment' => $sale->payments()->sole()->id]));

        $this->assertSame(0, BalanceEntry::query()->count());
    }

    #[Test]
    public function a_handover_leaves_the_balance_once_the_settlement_owner_confirms_it(): void
    {
        $this->paidOrder(5, [['payment_account_id' => $this->cbe->id, 'amount' => 500]]);

        $this->as($this->owner)->post(route('seller.balance.remit'), [
            'from_payment_account_id' => $this->cbe->id,
            'to_payment_account_id' => $this->settlement->id,
            'amount' => 300,
            'reference' => 'FT-1',
        ])->assertSessionHas('success');

        $remittance = Remittance::query()->sole();
        $this->assertSame(50000, $this->ledger()->heldCents($this->owner->id), 'Still held until confirmed.');
        $this->assertSame(20000, $this->ledger()->availableCents($this->owner->id, $this->cbe->id), 'But not handed over twice.');

        $this->as($this->boss)->get(route('seller.payments.inbox'))
            ->assertInertia(fn ($page) => $page->where('handovers.0.id', $remittance->id)->where('handovers.0.amount', 300));
        $this->as($this->boss)->get(route('seller.menu.index'))
            ->assertInertia(fn ($page) => $page->where('stats.payments_to_confirm', 1));

        $this->as($this->boss)->post(route('seller.handovers.confirm', $remittance))->assertSessionHas('success');

        $this->assertSame(20000, $this->ledger()->heldCents($this->owner->id));
        $this->assertSame(0, $this->ledger()->heldCents($this->boss->id), 'Settlement is the end of the line.');
        $this->as($this->owner)->get(route('seller.menu.index'))
            ->assertInertia(fn ($page) => $page->where('stats.balance.held', 200));
    }

    #[Test]
    public function a_rejected_handover_stays_on_the_balance(): void
    {
        $this->paidOrder(1, [['amount' => 100]]);

        $this->as($this->seller)->post(route('seller.balance.remit'), [
            'to_payment_account_id' => $this->settlement->id,
            'amount' => 100,
        ])->assertSessionHas('success');
        $remittance = Remittance::query()->sole();

        $this->as($this->boss)->post(route('seller.handovers.reject', $remittance))->assertSessionHas('success');

        $this->assertSame(Remittance::STATUS_REJECTED, $remittance->fresh()->status);
        $this->assertSame(10000, $this->ledger()->availableCents($this->seller->id, null));
    }

    #[Test]
    public function a_seller_cannot_hand_over_more_than_they_hold(): void
    {
        $this->paidOrder(2, [['amount' => 200]]);

        $remit = fn (float $amount) => $this->as($this->seller)->post(route('seller.balance.remit'), [
            'to_payment_account_id' => $this->settlement->id,
            'amount' => $amount,
        ]);

        $remit(250)->assertSessionHas('error');
        $remit(150)->assertSessionHas('success');
        $remit(100)->assertSessionHas('error', fn (string $message) => str_contains($message, '50.00'));

        // Nothing held in the CBE bucket.
        $this->as($this->seller)->post(route('seller.balance.remit'), [
            'from_payment_account_id' => $this->cbe->id,
            'to_payment_account_id' => $this->settlement->id,
            'amount' => 10,
        ])->assertSessionHas('error');

        $this->assertSame(1, Remittance::query()->count());
    }

    #[Test]
    public function money_only_goes_to_a_settlement_account_assigned_to_the_seller_and_not_their_own(): void
    {
        $this->paidOrder(2, [['amount' => 200]]);
        $unassigned = $this->account('awash', $this->boss, PaymentAccount::PURPOSE_SETTLEMENT);
        $own = $this->account('abay', $this->seller, PaymentAccount::PURPOSE_SETTLEMENT);
        $own->remitters()->sync([$this->seller->id]);

        foreach ([$unassigned, $own, $this->cbe] as $to) {
            $this->as($this->seller)->post(route('seller.balance.remit'), [
                'to_payment_account_id' => $to->id,
                'amount' => 50,
            ])->assertSessionHas('error');
        }

        $this->assertSame(0, Remittance::query()->count());
    }

    #[Test]
    public function only_the_settlement_owner_confirms_a_handover(): void
    {
        $this->paidOrder(1, [['amount' => 100]]);
        $this->as($this->seller)->post(route('seller.balance.remit'), ['to_payment_account_id' => $this->settlement->id, 'amount' => 100]);
        $remittance = Remittance::query()->sole();

        $this->as($this->seller)->post(route('seller.handovers.confirm', $remittance))->assertForbidden();
        $this->as($this->owner)->post(route('seller.handovers.confirm', $remittance))->assertForbidden();

        $this->assertSame(Remittance::STATUS_CLAIMED, $remittance->fresh()->status);
    }

    #[Test]
    public function cash_held_past_three_days_is_flagged_oldest_first(): void
    {
        $this->paidOrder(1, [['amount' => 100]]);
        $this->paidOrder(2, [['amount' => 200]]);
        [$old, $new] = BalanceEntry::query()->orderBy('id')->get()->all();
        BalanceEntry::query()->whereKey($old->id)->update(['created_at' => now()->subDays(5)]);
        BalanceEntry::query()->whereKey($new->id)->update(['created_at' => now()->subDays(4)]);

        $this->assertSame(300.0, (float) $this->ledger()->overdueCash($this->seller->id)['amount']);

        // Handing over 150 pays off the oldest 100 and 50 of the next.
        $this->as($this->seller)->post(route('seller.balance.remit'), ['to_payment_account_id' => $this->settlement->id, 'amount' => 150]);
        $this->as($this->boss)->post(route('seller.handovers.confirm', Remittance::query()->sole()));

        $this->assertSame(150.0, (float) $this->ledger()->overdueCash($this->seller->id)['amount']);

        BalanceEntry::query()->whereKey($new->id)->update(['created_at' => now()->subDay()]);
        $this->assertSame(0.0, (float) $this->ledger()->overdueCash($this->seller->id)['amount']);
    }

    /** @param array<int, array<string, mixed>> $parts */
    private function paidOrder(int $quantity, array $parts): Sale
    {
        $this->as($this->seller)->post(route('seller.orders.store'), ['cart_id' => $this->cart($quantity)->id, 'parts' => $parts])
            ->assertSessionHasNoErrors();
        $sale = Sale::query()->latest('id')->firstOrFail();

        foreach ($sale->payments()->where('status', Payment::STATUS_PENDING)->get() as $part) {
            $this->as($this->seller)->post(route('seller.orders.payments.claim', ['reference' => $sale->reference_number, 'payment' => $part->id]));
            $this->as($part->account->owner)->post(route('seller.payments.confirm', $part));
        }

        $this->assertSame(Sale::STAGE_PICK_PACK, $sale->fresh()->fulfillment_stage);

        return $sale;
    }

    private function account(string $provider, User $owner, string $purpose): PaymentAccount
    {
        return PaymentAccount::create([
            'store_id' => $this->store->id,
            'type' => PaymentAccount::TYPE_BANK,
            'provider' => $provider,
            'account_number' => (string) random_int(100000, 999999),
            'account_name' => 'Store account',
            'owner_user_id' => $owner->id,
            'purpose' => $purpose,
            'is_active' => true,
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
        $cart->variants()->attach($this->variant->id, ['quantity' => $quantity, 'price' => 100, 'store_id' => $this->store->id]);

        return $cart;
    }

    private function user(): User
    {
        $user = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $user->assignRole('seller');

        return $user->refresh();
    }

    private function as(User $user): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);
        $this->actingAs($user, 'web');

        return $this;
    }

    private function ledger(): BalanceLedger
    {
        return app(BalanceLedger::class);
    }
}
