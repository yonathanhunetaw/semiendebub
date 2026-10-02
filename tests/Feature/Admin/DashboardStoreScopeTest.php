<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The admin dashboard's store scope.
 *
 * The switcher at the top of the page is the whole reason it has one, and it
 * used to reach exactly one figure — the low-stock list — while the product,
 * variant, customer and cart tiles beside it kept reporting company-wide
 * totals. Picking "Second Store" changed one card out of six and left the rest
 * looking like Second Store's numbers.
 *
 * Three further faults went with it, each covered below:
 *
 *   - the scope travelled as a store *name*, so it broke on a rename and was
 *     ambiguous between two stores sharing one;
 *   - the low-stock list read `store_variants.stock`, a denormalised column
 *     nothing in this application maintains, so it reported the whole
 *     catalogue as out of stock;
 *   - the individual/business split was inverted against every other screen.
 */
class DashboardStoreScopeTest extends TestCase
{
    use RefreshDatabase;

    private Store $first;

    private Store $second;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withServerVariables(['HTTP_HOST' => 'admin.localhost']);

        $admin = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'web');

        $this->first = Store::factory()->create(['name' => 'First Store']);
        $this->second = Store::factory()->create(['name' => 'Second Store']);
    }

    /** An active item carried by `$store`, holding `$quantity` pieces there. */
    private function carry(Store $store, string $name, int $quantity): ItemVariant
    {
        $item = Item::factory()->create(['product_name' => $name, 'status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id, 'status' => 'active']);

        StoreVariant::factory()->create([
            'store_id' => $store->id,
            'item_id' => $item->id,
            'item_variant_id' => $variant->id,
            'active' => true,
        ]);

        ItemStock::create([
            'item_variant_id' => $variant->id,
            'location_type' => Store::class,
            'location_id' => $store->id,
            'quantity' => $quantity,
        ]);

        return $variant;
    }

    /** An open cart owned by `$seller`. There is no Cart factory. */
    private function openCart(User $seller, ?Customer $customer = null): Cart
    {
        return Cart::create([
            'store_id' => $seller->store_id,
            'seller_id' => $seller->id,
            'customer_id' => $customer?->id,
            'status' => 'open',
        ]);
    }

    /** @return array<string, mixed> */
    private function props(?string $scope = null): array
    {
        $url = route('admin.dashboard') . ($scope === null ? '' : '?store=' . urlencode($scope));

        $data = [];
        $this->get($url)->assertOk()->assertInertia(function (Assert $page) use (&$data): void {
            $data = $page->toArray()['props'];
        });

        return $data;
    }

    #[Test]
    public function unscoped_it_counts_every_store(): void
    {
        $this->carry($this->first, 'First Item', 100);
        $this->carry($this->second, 'Second Item', 100);

        $props = $this->props();

        $this->assertSame('all', $props['currentStore']);
        $this->assertSame(2, $props['productsCount']);
        $this->assertSame(2, $props['activeVariantsCount']);
    }

    #[Test]
    public function scoping_to_a_store_counts_only_its_products(): void
    {
        $this->carry($this->first, 'First Item', 100);
        $this->carry($this->second, 'Second Item', 100);

        $props = $this->props((string) $this->first->id);

        $this->assertSame(1, $props['productsCount'], 'productsCount ignored the scope entirely.');
        $this->assertSame(1, $props['activeVariantsCount']);
        $this->assertSame('First Store', $props['currentStoreName']);
    }

    #[Test]
    public function the_scope_travels_as_an_id(): void
    {
        $this->carry($this->first, 'First Item', 100);

        $props = $this->props((string) $this->first->id);

        $this->assertSame((string) $this->first->id, $props['currentStore']);
    }

    #[Test]
    public function a_store_name_is_still_accepted_so_old_links_keep_working(): void
    {
        $this->carry($this->first, 'First Item', 100);

        $props = $this->props('First Store');

        $this->assertSame('First Store', $props['currentStoreName']);
        $this->assertSame(1, $props['productsCount']);
    }

    #[Test]
    public function renaming_a_store_does_not_break_a_scope_held_by_id(): void
    {
        // The reason the scope moved off names.
        $this->carry($this->first, 'First Item', 100);
        $this->first->update(['name' => 'Renamed Store']);

        $props = $this->props((string) $this->first->id);

        $this->assertSame('Renamed Store', $props['currentStoreName']);
        $this->assertSame(1, $props['productsCount']);
    }

    #[Test]
    public function an_unknown_store_falls_back_to_all_stores_rather_than_failing(): void
    {
        // A bookmark pointing at a deleted store should show the dashboard,
        // not a 404: the switcher is a view preference.
        $this->carry($this->first, 'First Item', 100);

        $props = $this->props('99999');

        $this->assertSame('all', $props['currentStore']);
        $this->assertNull($props['currentStoreName']);
    }

    #[Test]
    public function low_stock_is_read_from_the_ledger_not_the_denormalised_column(): void
    {
        /*
         * `store_variants.stock` is 0 for every row in production because
         * nothing writes it, so the old query returned the entire catalogue.
         * This variant holds 500 pieces in the ledger and must not be listed.
         */
        $this->carry($this->first, 'Well Stocked', 500);

        $rows = $this->props((string) $this->first->id)['lowStockItems']['data'];

        $this->assertSame([], array_column($rows, 'product_name'));
    }

    #[Test]
    public function low_stock_lists_a_variant_that_is_genuinely_low(): void
    {
        $this->carry($this->first, 'Nearly Gone', 2);
        $this->carry($this->first, 'Plenty', 900);

        $rows = $this->props((string) $this->first->id)['lowStockItems']['data'];

        $this->assertSame(['Nearly Gone'], array_column($rows, 'product_name'));
        $this->assertSame(2, $rows[0]['total_stock']);
    }

    #[Test]
    public function low_stock_includes_a_variant_with_no_ledger_row_at_all(): void
    {
        // Deployed but never received: zero on hand, and the thing an admin
        // most needs to see.
        $item = Item::factory()->create(['product_name' => 'Never Received', 'status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id' => $this->first->id,
            'item_id' => $item->id,
            'item_variant_id' => $variant->id,
            'active' => true,
        ]);

        $rows = $this->props((string) $this->first->id)['lowStockItems']['data'];

        $this->assertSame(['Never Received'], array_column($rows, 'product_name'));
        $this->assertSame(0, $rows[0]['total_stock']);
    }

    #[Test]
    public function low_stock_is_scoped_to_the_selected_store(): void
    {
        $this->carry($this->first, 'Low At First', 1);
        $this->carry($this->second, 'Low At Second', 1);

        $rows = $this->props((string) $this->second->id)['lowStockItems']['data'];

        $this->assertSame(['Low At Second'], array_column($rows, 'product_name'));
    }

    #[Test]
    public function stock_held_at_another_store_does_not_mask_a_local_shortage(): void
    {
        /*
         * item_stocks is keyed by (item_variant_id, location_type, location_id)
         * and store_variants by (item_variant_id, store_id). Joining on the
         * variant alone pulls in the same variant's stock everywhere, so a
         * well-stocked warehouse would hide an empty shelf.
         */
        $variant = $this->carry($this->first, 'Shared Item', 0);

        StoreVariant::factory()->create([
            'store_id' => $this->second->id,
            'item_id' => $variant->item_id,
            'item_variant_id' => $variant->id,
            'active' => true,
        ]);
        ItemStock::create([
            'item_variant_id' => $variant->id,
            'location_type' => Store::class,
            'location_id' => $this->second->id,
            'quantity' => 900,
        ]);

        $rows = $this->props((string) $this->first->id)['lowStockItems']['data'];

        $this->assertSame(['Shared Item'], array_column($rows, 'product_name'));
        $this->assertSame(0, $rows[0]['total_stock']);
    }

    #[Test]
    public function customers_are_scoped_to_the_store(): void
    {
        Customer::factory()->count(3)->create(['store_id' => $this->first->id]);
        Customer::factory()->count(2)->create(['store_id' => $this->second->id]);

        $this->assertSame(5, $this->props()['customersCount']);
        $this->assertSame(3, $this->props((string) $this->first->id)['customersCount']);
    }

    #[Test]
    public function open_carts_are_scoped_to_the_stores_own_sellers(): void
    {
        $sellerAtFirst = User::factory()->create(['role' => 'seller', 'store_id' => $this->first->id]);
        $sellerAtSecond = User::factory()->create(['role' => 'seller', 'store_id' => $this->second->id]);

        $this->openCart($sellerAtFirst);
        $this->openCart($sellerAtSecond);

        $this->assertSame(1, $this->props((string) $this->first->id)['openCartsCount']);
    }

    #[Test]
    public function a_customer_holding_a_tin_counts_as_individual(): void
    {
        /*
         * The dashboard called a TIN-holder "business" while
         * Admin\Store\StoreController, Admin\Customers\Index and both seller
         * catalogues call it "individual" and price it with VAT. The dashboard
         * was the odd one out.
         */
        $seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->first->id]);

        $this->openCart($seller, Customer::factory()->create(['tin_number' => '0012345678']));
        $this->openCart($seller, Customer::factory()->create(['tin_number' => null]));

        $breakdown = $this->props((string) $this->first->id)['cartsBreakdown'];

        $this->assertSame(1, $breakdown['individual']);
        $this->assertSame(1, $breakdown['business']);
    }

    #[Test]
    public function the_switcher_options_carry_a_real_figure_per_store(): void
    {
        // The menu rendered "{name}: -- (Data)" because no figure was sent.
        $this->carry($this->first, 'First Item', 75);

        $options = collect($this->props()['stores']);
        $row = $options->firstWhere('name', 'First Store');

        $this->assertSame(75, $row['units']);
        $this->assertSame(1, $row['active_variants']);
        $this->assertSame(0, $options->firstWhere('name', 'Second Store')['units']);
    }

    #[Test]
    public function sessions_stay_company_wide_under_a_scope(): void
    {
        // A session is not a store, so it is deliberately not scoped. Named so
        // that the exception is recorded rather than looking like an oversight.
        $this->assertArrayHasKey('sessionsCount', $this->props((string) $this->first->id));
        $this->assertArrayHasKey('rolesBreakdown', $this->props((string) $this->first->id));
    }
}
