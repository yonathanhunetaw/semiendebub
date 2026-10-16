<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantIndividualPrice;
use App\Models\Store\StoreVariantSellerPrice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The branches of Admin → Stores pricing that AdminStorePricingTransfersTest
 * leaves alone: list-shaped (legacy) price matrices, the price-deviations
 * report with real discounts in it, removing one discount without losing the
 * price under it, and a customer from another store.
 */
class AdminStorePricingEdgeCasesTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Store $store;

    private StoreVariant $sv;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $this->sv = StoreVariant::factory()->create([
            'store_id' => $this->store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id,
            'pricing_matrix' => ['price' => 100.0, 'discount_price' => null, 'discount_ends_at' => null],
        ]);

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->admin);
    }

    private function customer(array $attributes = []): Customer
    {
        return Customer::query()->create($attributes + [
            'first_name' => 'Abebe', 'last_name' => 'Kebede', 'email' => 'c@example.com', 'phone_number' => '0911000001',
            'created_by' => $this->admin->id,
        ]);
    }

    private function seller(): User
    {
        $seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id, 'first_name' => 'Sara', 'last_name' => 'Tadesse']);
        $seller->assignRole('seller');

        return $seller;
    }

    // ---- List-shaped (legacy) matrices -------------------------------------

    #[Test]
    public function a_list_shaped_business_price_is_updated_in_its_first_tier(): void
    {
        $this->sv->update(['pricing_matrix' => [['price' => 50.0, 'min_qty' => 1], ['price' => 45.0, 'min_qty' => 10]]]);

        $this->patch(route('store-variant.update', $this->sv), ['price' => 60, 'discount_price' => 55, 'discount_ends_at' => '2026-12-01'])
            ->assertSuccessful();

        $matrix = $this->sv->fresh()->pricing_matrix;
        $this->assertEquals(60.0, $matrix[0]['price']);
        $this->assertEquals(55.0, $matrix[0]['discount_price']);
        $this->assertSame('2026-12-01', $matrix[0]['discount_ends_at']);
        $this->assertEquals(45.0, $matrix[1]['price'], 'the bulk tier is left alone');
    }

    #[Test]
    public function a_discount_override_on_a_list_shaped_business_price_lands_in_the_first_tier(): void
    {
        $this->sv->update(['pricing_matrix' => [['price' => 50.0]]]);

        $this->patch(route('store-price-override.update', ['source' => 'b2b', 'id' => $this->sv->id]), ['discount_price' => 40, 'discount_ends_at' => '2026-11-01'])
            ->assertRedirect();
        $this->assertEquals(40, $this->sv->fresh()->pricing_matrix[0]['discount_price']);

        $this->delete(route('store-price-override.destroy', ['source' => 'b2b', 'id' => $this->sv->id]))->assertRedirect();
        $this->assertNull($this->sv->fresh()->pricing_matrix[0]['discount_price']);
        $this->assertEquals(50.0, $this->sv->fresh()->pricing_matrix[0]['price']);
    }

    #[Test]
    public function an_individual_price_takes_the_first_tier_of_a_list_shaped_business_price_for_its_default_end_date(): void
    {
        $this->sv->update(['pricing_matrix' => [['price' => 50.0, 'discount_ends_at' => '2026-11-30']]]);

        $this->postJson(route('store-variant.individual-price.upsert', $this->sv), ['price' => 70])
            ->assertOk()->assertJsonPath('discount_ends_at', '2026-11-30');
    }

    #[Test]
    public function an_individual_discount_keeps_the_end_date_the_admin_picked(): void
    {
        $this->sv->update(['pricing_matrix' => ['price' => 50.0, 'discount_ends_at' => '2026-11-30']]);

        $this->postJson(route('store-variant.individual-price.upsert', $this->sv), [
            'price' => 70, 'discount_price' => 65, 'discount_ends_at' => '2026-12-25',
        ])->assertOk()->assertJsonPath('discount_ends_at', '2026-12-25');

        $this->assertSame('2026-12-25', $this->sv->fresh()->individualPrice->pricing_matrix['discount_ends_at']);

        // Clearing the date in the form (it sends null) clears it.
        $this->postJson(route('store-variant.individual-price.upsert', $this->sv), [
            'price' => 70, 'discount_price' => null, 'discount_ends_at' => null,
        ])->assertOk()->assertJsonPath('discount_ends_at', null);
    }

    #[Test]
    public function a_flat_legacy_seller_price_becomes_its_business_tier_when_a_second_tier_is_added(): void
    {
        $seller = $this->seller();
        $legacy = StoreVariantSellerPrice::query()->create([
            'store_variant_id' => $this->sv->id, 'seller_id' => $seller->id, 'active' => true,
            'pricing_matrix' => ['price' => 90.0, 'discount_price' => null, 'discount_ends_at' => null],
        ]);

        $this->postJson(route('store-variant.seller-price.upsert', $this->sv), ['seller_id' => $seller->id, 'customer_type' => 'individual', 'price' => 95])
            ->assertOk();

        $matrix = $legacy->fresh()->pricing_matrix;
        $this->assertEquals(90.0, $matrix['business']['price']);
        $this->assertEquals(95.0, $matrix['individual']['price']);
    }

    #[Test]
    public function removing_a_flat_legacy_seller_price_deletes_it(): void
    {
        $legacy = StoreVariantSellerPrice::query()->create([
            'store_variant_id' => $this->sv->id, 'seller_id' => $this->seller()->id, 'active' => true,
            'pricing_matrix' => ['price' => 90.0],
        ]);

        $this->deleteJson(route('store-variant.seller-price.destroy', $legacy), ['customer_type' => 'business'])->assertOk();

        $this->assertModelMissing($legacy);
    }

    #[Test]
    public function a_discount_on_a_flat_legacy_seller_price_is_set_and_cleared_on_the_record_itself(): void
    {
        $legacy = StoreVariantSellerPrice::query()->create([
            'store_variant_id' => $this->sv->id, 'seller_id' => $this->seller()->id, 'active' => true,
            'pricing_matrix' => ['price' => 90.0],
        ]);
        $url = route('store-price-override.update', ['source' => 'seller', 'id' => $legacy->id]);

        $this->patch($url, ['discount_price' => 80, 'discount_ends_at' => '2026-11-01'])->assertRedirect();
        $this->assertEquals(80, $legacy->fresh()->pricing_matrix['discount_price']);

        $this->delete(route('store-price-override.destroy', ['source' => 'seller', 'id' => $legacy->id]))->assertRedirect();
        $this->assertNull($legacy->fresh()->pricing_matrix['discount_price']);
        $this->assertEquals(90.0, $legacy->fresh()->pricing_matrix['price']);
    }

    // ---- Removing a discount keeps the price -------------------------------

    #[Test]
    public function removing_a_customer_discount_keeps_the_customers_own_price(): void
    {
        $price = StoreVariantCustomerPrice::query()->create([
            'store_variant_id' => $this->sv->id, 'customer_id' => $this->customer()->id,
            'pricing_matrix' => ['price' => 88.0, 'discount_price' => 80.0, 'discount_ends_at' => now()->addDays(5)->toDateString()],
        ]);

        $this->delete(route('store-price-override.destroy', ['source' => 'customer', 'id' => $price->id]))->assertRedirect();

        $matrix = $price->fresh()?->pricing_matrix;
        $this->assertNotNull($matrix, 'the negotiated price must survive removing its discount');
        $this->assertEquals(88.0, $matrix['price']);
        $this->assertNull($matrix['discount_price']);
        $this->assertNull($matrix['discount_ends_at']);
    }

    #[Test]
    public function removing_a_discount_that_does_not_exist_is_not_found(): void
    {
        foreach (['b2b', 'individual', 'customer', 'seller'] as $source) {
            $this->delete(route('store-price-override.destroy', ['source' => $source, 'id' => 999999]))->assertNotFound();
            $this->patch(route('store-price-override.update', ['source' => $source, 'id' => 999999]), ['discount_price' => 1])->assertNotFound();
        }
        $this->delete(route('store-price-override.destroy', ['source' => 'nonsense', 'id' => 1]))->assertStatus(422);
    }

    // ---- Customers of another store ----------------------------------------

    #[Test]
    public function a_customer_price_is_refused_for_a_customer_of_another_store(): void
    {
        $other = Store::factory()->create(['name' => 'Other Store']);
        $customer = $this->customer(['store_id' => $other->id]);

        $this->postJson(route('store-variant.customer-price.upsert', $this->sv), [
            'customer_id' => $customer->id, 'customer_type' => 'business', 'price' => 80,
        ])->assertStatus(422)->assertJsonPath('message', 'This customer belongs to another store.');

        $this->assertSame(0, StoreVariantCustomerPrice::query()->count());
    }

    #[Test]
    public function a_customer_price_is_accepted_for_this_stores_own_customer(): void
    {
        $customer = $this->customer(['store_id' => $this->store->id]);

        $this->postJson(route('store-variant.customer-price.upsert', $this->sv), [
            'customer_id' => $customer->id, 'customer_type' => 'business', 'price' => 80,
        ])->assertOk()->assertJsonPath('customer.id', $customer->id);
    }

    // ---- The price deviations report ---------------------------------------

    #[Test]
    public function the_deviations_report_is_empty_for_a_store_with_no_variants(): void
    {
        $empty = Store::factory()->create(['name' => 'Empty Store']);

        $this->get(route('store.deviations', $empty))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Inventory/Stores/PriceDeviations')
                ->where('store.id', $empty->id)->where('deviations', []));
    }

    #[Test]
    public function the_deviations_report_lists_every_discount_ending_within_30_days_soonest_first(): void
    {
        $this->travelTo(now()->setTime(12, 0));
        $soon = now()->addDays(3)->toDateString();
        $later = now()->addDays(20)->toDateString();
        $far = now()->addDays(60)->toDateString();

        // Business price: a list-shaped matrix with a discount ending soon.
        $this->sv->update(['pricing_matrix' => [['price' => 100.0, 'discount_price' => 90.0, 'discount_ends_at' => $soon]]]);

        // Individual price: discount ending far away, so left out.
        StoreVariantIndividualPrice::query()->create([
            'store_variant_id' => $this->sv->id, 'active' => true,
            'pricing_matrix' => ['price' => 115.0, 'discount_price' => 100.0, 'discount_ends_at' => $far],
        ]);

        // A customer discount ending later, and one with no end date (left out).
        StoreVariantCustomerPrice::query()->create([
            'store_variant_id' => $this->sv->id, 'customer_id' => $this->customer()->id,
            'pricing_matrix' => ['price' => 95.0, 'discount_price' => 85.0, 'discount_ends_at' => $later],
        ]);
        StoreVariantCustomerPrice::query()->create([
            'store_variant_id' => $this->sv->id,
            'customer_id' => $this->customer(['email' => 'd@example.com', 'phone_number' => '0911000002'])->id,
            'pricing_matrix' => ['price' => 95.0, 'discount_price' => 85.0, 'discount_ends_at' => null],
        ]);

        // A seller price with both tiers discounted, and a flat legacy one.
        $seller = $this->seller();
        StoreVariantSellerPrice::query()->create([
            'store_variant_id' => $this->sv->id, 'seller_id' => $seller->id, 'active' => true,
            'pricing_matrix' => [
                'business' => ['price' => 98.0, 'discount_price' => 92.0, 'discount_ends_at' => $later],
                'individual' => ['price' => 110.0, 'discount_price' => 105.0, 'discount_ends_at' => $soon],
            ],
        ]);
        $otherSeller = $this->seller();
        StoreVariantSellerPrice::query()->create([
            'store_variant_id' => $this->sv->id, 'seller_id' => $otherSeller->id, 'active' => true,
            'pricing_matrix' => ['price' => 97.0, 'discount_price' => 91.0, 'discount_ends_at' => $later],
        ]);

        $this->get(route('store.deviations', $this->store))->assertOk()
            ->assertInertia(function ($page) {
                $page->component('Admin/Inventory/Stores/PriceDeviations')->has('deviations', 5);

                $rows = collect($page->toArray()['props']['deviations']);
                $this->assertSame(
                    ['b2b', 'seller', 'customer', 'seller', 'seller'],
                    $rows->pluck('tier')->all(),
                );
                $this->assertSame(['Business default', 'Sara Tadesse (Individual)'], $rows->take(2)->pluck('subject')->all());
                $this->assertContains('Abebe Kebede', $rows->pluck('subject')->all());
                $this->assertContains('Sara Tadesse (B2B)', $rows->pluck('subject')->all());
                $this->assertSame([2, 2, 19, 19, 19], $rows->pluck('days_left')->all());
                $this->assertEquals(90.0, $rows[0]['discount_price']);
                $this->assertSame($this->sv->id, $rows[0]['variant']['id']);
            });
    }

    // ---- Transfers from a shelf -------------------------------------------

    #[Test]
    public function a_shelf_transfer_is_raised_for_the_store_and_dispatch_waits_for_the_shelf_to_hold_it(): void
    {
        $shelf = $this->store->inventoryLocations()->shelves()->firstOrFail();

        $this->from(route('store.show', $this->store))
            ->post(route('store.transfer.create', $this->store), [
                'store_variant_id' => $this->sv->id, 'quantity' => 5, 'from_location_id' => $shelf->id, 'notes' => 'for the window',
            ])
            ->assertRedirect(route('store.show', $this->store))
            ->assertSessionMissing('error');

        $transfer = Transfer::query()->sole();
        $this->assertSame('pending', $transfer->status);
        $this->assertSame(5, (int) $transfer->quantity);
        $this->assertSame($this->sv->id, (int) $transfer->store_variant_id);
        $this->assertSame($this->store->id, (int) $transfer->from_store_id);
        $this->assertSame($this->store->id, (int) $transfer->to_store_id);
        $this->assertSame('for the window', $transfer->notes);
        $this->assertSame($this->admin->id, (int) $transfer->initiated_by);

        // The shelf holds none of it, so it cannot leave yet.
        $this->from(route('store.replenish', $this->store))
            ->patch(route('store-transfer.dispatch', $transfer))
            ->assertRedirect(route('store.replenish', $this->store))
            ->assertSessionHas('error');
        $this->assertSame('pending', $transfer->fresh()->status);
    }
}
