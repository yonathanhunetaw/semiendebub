<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Admin → Payment accounts: the accounts customers pay into, and their owners. */
class AdminPaymentAccountsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private User $seller;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $this->seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id, 'first_name' => 'Hana']);
        $this->seller->assignRole('seller');

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($admin);
    }

    #[Test]
    public function an_admin_adds_an_account_and_gives_it_to_a_seller(): void
    {
        $this->post(route('admin.payment-accounts.store'), $this->form())->assertSessionHas('success');

        $account = PaymentAccount::query()->sole();
        $this->assertSame([$this->seller->id, 'collection', true], [(int) $account->owner_user_id, $account->purpose, $account->is_active]);

        $this->get(route('admin.payment-accounts.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Payments/Accounts')
                ->where('accounts.0.owner', fn ($name) => str_starts_with((string) $name, 'Hana'))
                ->where('owners.0.id', $this->seller->id));
    }

    #[Test]
    public function the_owner_must_be_a_seller_and_the_provider_must_match_the_type(): void
    {
        $courier = User::factory()->create(['role' => 'delivery']);
        $courier->assignRole('delivery');

        $this->post(route('admin.payment-accounts.store'), $this->form(['owner_user_id' => $courier->id]))
            ->assertSessionHasErrors('owner_user_id');
        $this->post(route('admin.payment-accounts.store'), $this->form(['type' => 'wallet', 'provider' => 'cbe']))
            ->assertSessionHasErrors('provider');

        $this->assertSame(0, PaymentAccount::query()->count());
    }

    #[Test]
    public function an_admin_turns_an_account_off_and_cannot_remove_one_with_payments_waiting(): void
    {
        $this->post(route('admin.payment-accounts.store'), $this->form());
        $account = PaymentAccount::query()->sole();

        $this->put(route('admin.payment-accounts.update', $account), $this->form(['is_active' => false]))->assertSessionHas('success');
        $this->assertFalse($account->fresh()->is_active);

        Payment::query()->insert([
            'sale_id' => \App\Models\Finance\Sale::query()->insertGetId(['store_id' => $this->store->id, 'total_amount' => 10, 'created_at' => now(), 'updated_at' => now()]),
            'payment_method' => 'bank',
            'payment_account_id' => $account->id,
            'amount' => 10,
            'status' => Payment::STATUS_CLAIMED,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->delete(route('admin.payment-accounts.destroy', $account))->assertSessionHas('error');
        $this->assertNotNull($account->fresh());

        Payment::query()->update(['status' => Payment::STATUS_CONFIRMED]);
        $this->delete(route('admin.payment-accounts.destroy', $account))->assertSessionHas('success');
        $this->assertSoftDeleted($account);
    }

    #[Test]
    public function a_settlement_account_lists_who_hands_money_over_but_never_its_owner(): void
    {
        $other = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $other->assignRole('seller');

        $this->post(route('admin.payment-accounts.store'), $this->form(['purpose' => 'settlement', 'remitter_ids' => [$this->seller->id]]))
            ->assertSessionHasErrors('remitter_ids.0');

        $this->post(route('admin.payment-accounts.store'), $this->form(['purpose' => 'settlement', 'remitter_ids' => [$other->id]]))
            ->assertSessionHas('success');

        $account = PaymentAccount::query()->sole();
        $this->assertSame([$other->id], $account->remitters()->pluck('users.id')->map(fn ($id) => (int) $id)->all());

        // A collection account has no remitters.
        $this->put(route('admin.payment-accounts.update', $account), $this->form(['purpose' => 'collection', 'remitter_ids' => [$other->id]]))
            ->assertSessionHas('success');
        $this->assertSame(0, $account->remitters()->count());
    }

    #[Test]
    public function the_balances_page_shows_what_each_seller_holds(): void
    {
        $this->post(route('admin.payment-accounts.store'), $this->form());
        $sale = \App\Models\Finance\Sale::query()->create(['store_id' => $this->store->id, 'total_amount' => 120, 'reference_number' => 'SALE-X']);
        $payment = Payment::query()->create([
            'sale_id' => $sale->id, 'payment_method' => 'cash', 'amount' => 120, 'status' => Payment::STATUS_CONFIRMED,
            'confirmed_by' => $this->seller->id, 'confirmed_at' => now(),
        ]);
        app(\App\Services\Finance\BalanceLedger::class)->recordPayment($payment);

        $this->get(route('admin.balances.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Payments/Balances')
                ->where('sellers.0.id', $this->seller->id)
                ->where('sellers.0.held', 120)
                ->where('sellers.0.cash', 120));
    }

    /** @param array<string, mixed> $overrides */
    private function form(array $overrides = []): array
    {
        return [
            'store_id' => $this->store->id,
            'type' => 'bank',
            'provider' => 'cbe',
            'account_number' => '1000 2145 88721',
            'account_name' => 'Semien Debub Trading PLC',
            'owner_user_id' => $this->seller->id,
            'purpose' => 'collection',
            'is_active' => true,
            ...$overrides,
        ];
    }
}
