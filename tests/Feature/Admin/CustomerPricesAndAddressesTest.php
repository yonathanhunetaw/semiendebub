<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Auth\CustomerAddress;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Services\PriceProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Customers end to end: individual vs business on create, the seller's
 * customers belonging to their store, their own prices set one at a time or
 * in bulk (both directions), and their saved delivery locations on the
 * admin's customer list.
 */
class CustomerPricesAndAddressesTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Store $store;

    private StoreVariant $sv;

    private StoreVariant $other;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $this->sv = $this->storeVariant($this->store, 100.0);
        $this->other = $this->storeVariant($this->store, 40.0);
    }

    #[Test]
    public function an_individual_needs_a_tin_and_a_business_never_keeps_one(): void
    {
        $seller = $this->seller();

        $this->asSeller($seller)->post(route('seller.customers.store'), $this->contact() + ['customer_type' => 'individual'])
            ->assertSessionHasErrors(['tin_number' => 'An individual customer needs a TIN.']);
        $this->assertSame(0, Customer::query()->count());

        $this->asSeller($seller)->post(route('seller.customers.store'), $this->contact() + ['customer_type' => 'business', 'tin_number' => '123'])
            ->assertSessionHasNoErrors();
        $this->assertNull(Customer::query()->sole()->tin_number);
    }

    #[Test]
    public function a_sellers_customer_belongs_to_their_store_and_other_stores_cannot_see_it(): void
    {
        $seller = $this->seller();
        $this->asSeller($seller)->post(route('seller.customers.store'), $this->contact() + ['customer_type' => 'individual', 'tin_number' => '1234567890']);

        $customer = Customer::query()->sole();
        $this->assertSame($this->store->id, (int) $customer->store_id);

        $outsider = $this->seller(Store::factory()->create(['type' => Store::TYPE_RETAIL]));
        $this->asSeller($outsider)->get(route('seller.customers.show', $customer))->assertNotFound();
        $this->asSeller($outsider)->get(route('seller.customers.index'))
            ->assertInertia(fn ($page) => $page->where('customers', []));
    }

    #[Test]
    public function one_price_goes_to_many_customers_at_once_and_only_this_stores(): void
    {
        [$a, $b] = [$this->customer(), $this->customer()];
        $foreign = $this->customer(Store::factory()->create(['type' => Store::TYPE_RETAIL]));

        $this->asAdmin()->postJson(route('store-variant.customer-price.bulk', $this->sv), [
            'customer_ids' => [$a->id, $b->id], 'price' => 90, 'discount_price' => 85,
        ])->assertOk()->assertJsonCount(2);

        $this->assertSame(2, StoreVariantCustomerPrice::query()->count());
        $ladder = PriceProvider::getPriceLadder($this->sv->id, $this->store->id, null, $b->id);
        $this->assertSame(85.0, PriceProvider::getFinalPrice($ladder));

        $this->asAdmin()->postJson(route('store-variant.customer-price.bulk', $this->sv), [
            'customer_ids' => [$a->id, $foreign->id], 'price' => 70,
        ])->assertStatus(422);
        $this->assertSame(90.0, (float) StoreVariantCustomerPrice::query()->where('customer_id', $a->id)->sole()->pricing_matrix['price'], 'All or nothing.');
    }

    #[Test]
    public function one_customer_gets_prices_on_many_items_and_a_blank_price_removes_one(): void
    {
        $customer = $this->customer();

        $this->asAdmin()->get(route('admin.customers.prices', $customer))
            ->assertInertia(fn ($page) => $page->component('Admin/Customers/Prices')->has('rows', 2));

        $this->asAdmin()->put(route('admin.customers.prices.update', $customer), ['rows' => [
            ['store_variant_id' => $this->sv->id, 'price' => 95],
            ['store_variant_id' => $this->other->id, 'price' => 35],
        ]])->assertSessionHas('success');
        $this->assertSame(2, StoreVariantCustomerPrice::query()->where('customer_id', $customer->id)->count());

        $this->asAdmin()->put(route('admin.customers.prices.update', $customer), ['rows' => [
            ['store_variant_id' => $this->other->id, 'price' => null],
        ]])->assertSessionHas('success');
        $this->assertSame([$this->sv->id], StoreVariantCustomerPrice::query()->pluck('store_variant_id')->map(fn ($id) => (int) $id)->all());

        // Another store's item is refused.
        $elsewhere = $this->storeVariant(Store::factory()->create(['type' => Store::TYPE_RETAIL]), 10.0);
        $this->asAdmin()->put(route('admin.customers.prices.update', $customer), ['rows' => [
            ['store_variant_id' => $elsewhere->id, 'price' => 5],
        ]])->assertSessionHas('error');
    }

    #[Test]
    public function the_admin_customer_list_shows_saved_delivery_locations(): void
    {
        $customer = $this->customer();
        CustomerAddress::remember($customer->id, 'Bole, Woreda 3', 'Abebe', '0911000000');
        CustomerAddress::remember($customer->id, '  bole,  woreda 3 ', null, null);

        $this->assertSame(2, CustomerAddress::query()->sole()->times_used, 'The same place is not saved twice.');

        $this->asAdmin()->get(route('admin.customers.index'))
            ->assertInertia(fn ($page) => $page->where('customers.0.addresses.0.address', 'Bole, Woreda 3'));
    }

    private function storeVariant(Store $store, float $price): StoreVariant
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        return StoreVariant::factory()->create([
            'store_id' => $store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id,
            'pricing_matrix' => ['price' => $price],
        ]);
    }

    private function customer(?Store $store = null): Customer
    {
        return Customer::factory()->create(['store_id' => ($store ?? $this->store)->id]);
    }

    /** @return array<string, string> */
    private function contact(): array
    {
        return ['first_name' => 'Abebe', 'email' => 'abebe@example.com', 'phone_number' => '0911000001'];
    }

    private function seller(?Store $store = null): User
    {
        $user = User::factory()->create(['role' => 'seller', 'store_id' => ($store ?? $this->store)->id]);
        $user->assignRole('seller');

        return $user->refresh();
    }

    private function asSeller(User $seller): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);
        $this->actingAs($seller);

        return $this;
    }

    private function asAdmin(): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->admin);

        return $this;
    }
}
