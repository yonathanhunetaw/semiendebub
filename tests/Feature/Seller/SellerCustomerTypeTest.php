<?php

declare(strict_types=1);

namespace Tests\Feature\Seller;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Customer type when a seller adds a customer.
 *
 * This application identifies the type by the TIN: a customer holding one is
 * "individual" and is priced with VAT, a customer without one is "business".
 * Unusual naming, but it is the convention every surface already follows —
 * Admin\Store\StoreController, Admin\Customers\Index and both seller
 * catalogues all read it that way — so the seller form follows it rather than
 * introducing a second vocabulary.
 *
 * Admin has offered the choice for a while. Seller\CustomerController's
 * validator simply had no `tin_number` rule, so the field was stripped from
 * every request and every customer a seller created came out a business,
 * whatever the seller intended, and could never be quoted a VAT-inclusive
 * price.
 */
class SellerCustomerTypeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withServerVariables(['HTTP_HOST' => 'seller.localhost']);

        $seller = User::factory()->create([
            'store_id' => Store::factory()->create()->id,
            'role' => 'seller',
        ]);

        \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'seller']);
        $seller->assignRole('seller');

        $this->actingAs($seller, 'web');
    }

    /** @return array<string, string> */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'first_name' => 'Abebe',
            'last_name' => 'Bekele',
            'email' => 'abebe@example.com',
            'phone_number' => '0911000001',
            'city' => 'addis ababa',
        ], $overrides);
    }

    #[Test]
    public function a_seller_can_create_an_individual_with_a_tin(): void
    {
        $this->post(route('seller.customers.store'), $this->payload(['tin_number' => '0012345678']))
            ->assertRedirect(route('seller.customers.index'))
            ->assertSessionHas('success');

        $this->assertDatabaseHas('customers', [
            'email' => 'abebe@example.com',
            'tin_number' => '0012345678',
        ]);
    }

    #[Test]
    public function a_seller_can_create_a_business_with_no_tin(): void
    {
        $this->post(route('seller.customers.store'), $this->payload(['tin_number' => '']))
            ->assertRedirect(route('seller.customers.index'));

        // null, not "": every type check in the application is `->tin_number ?`
        // or `! empty(...)`, and an empty string reads false to those but still
        // collides with the unique index on the second business created.
        $this->assertNull(Customer::firstWhere('email', 'abebe@example.com')->tin_number);
    }

    #[Test]
    public function two_businesses_can_be_created_without_colliding_on_a_blank_tin(): void
    {
        $this->post(route('seller.customers.store'), $this->payload(['tin_number' => '']))
            ->assertSessionHasNoErrors();

        $this->post(route('seller.customers.store'), $this->payload([
            'email' => 'second@example.com',
            'phone_number' => '0911000002',
            'tin_number' => '',
        ]))->assertSessionHasNoErrors();

        $this->assertSame(2, Customer::whereNull('tin_number')->count());
    }

    #[Test]
    public function a_tin_already_in_use_is_rejected(): void
    {
        Customer::factory()->create(['tin_number' => '0012345678']);

        $this->post(route('seller.customers.store'), $this->payload(['tin_number' => '0012345678']))
            ->assertSessionHasErrors('tin_number');

        $this->assertDatabaseMissing('customers', ['email' => 'abebe@example.com']);
    }

    #[Test]
    public function a_tin_longer_than_the_column_is_rejected(): void
    {
        $this->post(route('seller.customers.store'), $this->payload(['tin_number' => '0123456789EXTRA']))
            ->assertSessionHasErrors('tin_number');
    }

    #[Test]
    public function omitting_the_field_entirely_still_creates_a_business(): void
    {
        // The field is optional, so an older client that does not send it must
        // not start failing validation.
        $this->post(route('seller.customers.store'), $this->payload())
            ->assertSessionHasNoErrors();

        $this->assertNull(Customer::firstWhere('email', 'abebe@example.com')->tin_number);
    }

    #[Test]
    public function a_seller_can_turn_a_business_into_an_individual(): void
    {
        $customer = Customer::factory()->create(['tin_number' => null]);

        $this->put(route('seller.customers.update', $customer), $this->payload([
            'email' => $customer->email,
            'phone_number' => $customer->phone_number,
            'tin_number' => '0099887766',
        ]))->assertSessionHasNoErrors();

        $this->assertSame('0099887766', $customer->fresh()->tin_number);
    }

    #[Test]
    public function a_seller_can_turn_an_individual_into_a_business(): void
    {
        $customer = Customer::factory()->create(['tin_number' => '0055443322']);

        $this->put(route('seller.customers.update', $customer), $this->payload([
            'email' => $customer->email,
            'phone_number' => $customer->phone_number,
            'tin_number' => '',
        ]))->assertSessionHasNoErrors();

        $this->assertNull($customer->fresh()->tin_number);
    }

    #[Test]
    public function an_update_that_omits_the_field_leaves_the_tin_alone(): void
    {
        /*
         * Guards the `$request->has('tin_number')` check in update(): without
         * it, any caller that posts the other fields — a name correction from a
         * form that does not carry the TIN — would silently demote an
         * individual to a business and change how they are priced.
         */
        $customer = Customer::factory()->create(['tin_number' => '0077665544']);

        $this->put(route('seller.customers.update', $customer), [
            'first_name' => 'Renamed',
            'last_name' => $customer->last_name,
            'email' => $customer->email,
            'phone_number' => $customer->phone_number,
        ])->assertSessionHasNoErrors();

        $this->assertSame('0077665544', $customer->fresh()->tin_number);
        $this->assertSame('Renamed', $customer->fresh()->first_name);
    }

    #[Test]
    public function keeping_its_own_tin_on_update_is_not_a_collision(): void
    {
        $customer = Customer::factory()->create(['tin_number' => '0011223344']);

        $this->put(route('seller.customers.update', $customer), $this->payload([
            'email' => $customer->email,
            'phone_number' => $customer->phone_number,
            'tin_number' => '0011223344',
        ]))->assertSessionHasNoErrors();

        $this->assertSame('0011223344', $customer->fresh()->tin_number);
    }
}
