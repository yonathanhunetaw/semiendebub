<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantSellerPrice;
use App\Services\Item\ItemDeployer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Seller and customer prices, the on-sale switch and the business pool, from the item setup page. */
class ItemSetupPricesTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Item $item;

    private StoreVariant $row;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        Role::firstOrCreate(['name' => 'admin']);
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $admin = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $admin->assignRole('admin');
        $this->actingAs($admin);

        $this->store = Store::factory()->create(['name' => 'Main Store', 'status' => 'active']);
        $this->item = Item::factory()->create(['status' => 'active']);
        ItemVariant::factory()->create(['item_id' => $this->item->id]);
        app(ItemDeployer::class)->deploy($this->item, $this->store);
        $this->row = StoreVariant::query()->sole();
        $this->row->forceFill(['pricing_matrix' => ['price' => 100, 'discount_price' => null, 'discount_ends_at' => null], 'active' => true])->save();
    }

    private function line(array $extra = []): array
    {
        return [array_merge(['store_variant_id' => $this->row->id, 'price' => 90], $extra)];
    }

    // ---- seller prices ---------------------------------------------------------

    #[Test]
    public function a_seller_price_is_saved_per_tier_and_listed_on_the_page(): void
    {
        $seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);

        $this->put(route('admin.items.setup.seller-prices', [$this->item, $this->store]), ['seller_id' => $seller->id, 'customer_type' => 'business', 'variants' => $this->line()])->assertRedirect();
        $this->put(route('admin.items.setup.seller-prices', [$this->item, $this->store]), ['seller_id' => $seller->id, 'customer_type' => 'individual', 'variants' => $this->line(['price' => 95])])->assertRedirect();

        $matrix = StoreVariantSellerPrice::query()->sole()->pricing_matrix;
        $this->assertSame(90.0, (float) $matrix['business']['price']);
        $this->assertSame(95.0, (float) $matrix['individual']['price']);

        $this->get(route('admin.items.setup', $this->item))->assertInertia(fn ($page) => $page
            ->has('stores.0.seller_prices', 2)
            ->where('stores.0.seller_prices.0.seller_id', $seller->id)
            ->has('stores.0.sellers', 1));
    }

    #[Test]
    public function a_blank_price_line_removes_that_tier_and_removing_a_seller_clears_it(): void
    {
        $seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $url = route('admin.items.setup.seller-prices', [$this->item, $this->store]);
        $this->put($url, ['seller_id' => $seller->id, 'customer_type' => 'business', 'variants' => $this->line()]);
        $this->put($url, ['seller_id' => $seller->id, 'customer_type' => 'individual', 'variants' => $this->line()]);

        $this->put($url, ['seller_id' => $seller->id, 'customer_type' => 'business', 'variants' => [['store_variant_id' => $this->row->id, 'price' => null]]])->assertRedirect();
        $this->assertArrayNotHasKey('business', StoreVariantSellerPrice::query()->sole()->pricing_matrix);
        $this->assertArrayHasKey('individual', StoreVariantSellerPrice::query()->sole()->pricing_matrix);

        $this->delete(route('admin.items.setup.seller-prices.destroy', [$this->item, $this->store, $seller]), ['customer_type' => 'individual'])->assertRedirect();
        $this->assertSame(0, StoreVariantSellerPrice::query()->count());
    }

    #[Test]
    public function a_seller_from_another_store_is_refused(): void
    {
        $other = User::factory()->create(['role' => 'seller', 'store_id' => Store::factory()->create()->id]);

        $this->put(route('admin.items.setup.seller-prices', [$this->item, $this->store]), ['seller_id' => $other->id, 'customer_type' => 'business', 'variants' => $this->line()])
            ->assertSessionHasErrors('seller_id');
        $this->assertSame(0, StoreVariantSellerPrice::query()->count());
    }

    // ---- customer prices ---------------------------------------------------------

    #[Test]
    public function a_customer_price_is_saved_found_by_search_and_removed(): void
    {
        $customer = Customer::factory()->create(['name' => 'Almaz Trading', 'store_id' => $this->store->id, 'tin_number' => null]);

        $this->put(route('admin.items.setup.customer-prices', [$this->item, $this->store]), ['customer_id' => $customer->id, 'variants' => $this->line()])->assertRedirect();
        $this->assertSame(90.0, (float) StoreVariantCustomerPrice::query()->sole()->pricing_matrix['price']);

        $this->getJson(route('admin.items.setup.customers', $this->store).'?q=Almaz')->assertOk()
            ->assertJsonPath('0.name', 'Almaz Trading')->assertJsonPath('0.type', 'business');

        $this->delete(route('admin.items.setup.customer-prices.destroy', [$this->item, $this->store, $customer]))->assertRedirect();
        $this->assertSame(0, StoreVariantCustomerPrice::query()->count());
    }

    #[Test]
    public function a_customer_made_on_the_seller_form_is_found_by_first_or_full_name(): void
    {
        $customer = Customer::factory()->create(['store_id' => $this->store->id, 'tin_number' => '123']);
        // As the seller's form saves it: a first and last name and no stored name (the model's setter would overwrite them).
        \Illuminate\Support\Facades\DB::table('customers')->where('id', $customer->id)->update(['name' => null, 'first_name' => 'Demo', 'last_name' => 'Customer 55']);

        foreach (['Demo', 'Customer 55', 'Demo Customer'] as $q) {
            $this->getJson(route('admin.items.setup.customers', $this->store).'?q='.urlencode($q))->assertOk()
                ->assertJsonPath('0.name', 'Demo Customer 55')->assertJsonPath('0.type', 'individual');
        }
    }

    #[Test]
    public function a_customer_of_another_store_is_refused(): void
    {
        $customer = Customer::factory()->create(['store_id' => Store::factory()->create()->id]);

        $this->put(route('admin.items.setup.customer-prices', [$this->item, $this->store]), ['customer_id' => $customer->id, 'variants' => $this->line()])
            ->assertSessionHasErrors('customer_id');
    }

    #[Test]
    public function a_discount_above_the_price_is_refused(): void
    {
        $customer = Customer::factory()->create(['store_id' => $this->store->id]);

        $this->put(route('admin.items.setup.customer-prices', [$this->item, $this->store]), ['customer_id' => $customer->id, 'variants' => $this->line(['discount_price' => 120, 'discount_ends_at' => '2030-01-01'])])
            ->assertSessionHasErrors('variants.0.discount_price');
    }

    // ---- on sale and the business pool -----------------------------------------------

    #[Test]
    public function the_on_sale_switch_forces_a_variant_off_and_lifts_it_again_and_the_pool_is_saved(): void
    {
        $url = route('admin.items.setup.prices', [$this->item, $this->store]);

        $this->put($url, ['variants' => [['store_variant_id' => $this->row->id, 'price' => 100, 'on_sale' => false, 'business_pool' => 25]]])->assertRedirect();
        $row = $this->row->fresh();
        $this->assertFalse((bool) $row->active);
        $this->assertSame('forced', $row->manual_status);
        $this->assertSame(25, (int) $row->business_pool);

        $this->put($url, ['variants' => [['store_variant_id' => $this->row->id, 'price' => 100, 'on_sale' => true, 'business_pool' => null]]])->assertRedirect();
        $row = $this->row->fresh();
        $this->assertTrue((bool) $row->active);
        $this->assertSame('auto', $row->manual_status);
        $this->assertNull($row->business_pool);
    }
}
