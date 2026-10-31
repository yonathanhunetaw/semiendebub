<?php

declare(strict_types=1);

namespace Tests\Feature\Vendor;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Vendor\VendorApplication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * A vendor is a store (docs/plans/missing-areas-prompt.md §6): a business
 * applies, a global admin approves (the store and its owner are created) or
 * rejects; the owner sees their own store in the vendor app; the shop has a
 * page per store at /s/{slug} while /shop stays the default store.
 */
class VendorAppTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Store $main;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['vendor', 'admin', 'user'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->main = Store::factory()->create(['name' => 'Main Store', 'status' => 'active']);
        config(['storefront.store_id' => $this->main->id]);

        $this->admin = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $this->admin->assignRole('admin');
    }

    private function on(string $app): self
    {
        return $this->withServerVariables(['HTTP_HOST' => "{$app}.".config('app.system_domain')]);
    }

    /** @return array<string, string> */
    private function application(array $overrides = []): array
    {
        return $overrides + [
            'business_name' => 'Bole Electronics',
            'contact_first_name' => 'Hanna',
            'contact_last_name' => 'Tesfaye',
            'email' => 'hanna@bole.test',
            'phone_number' => '0911000001',
            'city' => 'Addis Ababa',
            'description' => 'Phones and chargers.',
        ];
    }

    private function approved(): Store
    {
        $this->on('vendor')->post(route('vendor.apply'), $this->application())->assertSessionHas('success');
        $this->on('admin')->actingAs($this->admin)
            ->post(route('admin.vendors.approve', VendorApplication::query()->firstOrFail()))
            ->assertSessionHas('vendor_handover');

        return Store::query()->where('name', 'Bole Electronics')->firstOrFail();
    }

    // ---- Onboarding ----

    #[Test]
    public function a_business_applies_and_an_approval_opens_its_store_with_an_owner(): void
    {
        $store = $this->approved();
        $owner = $store->owner;

        $this->assertSame('bole-electronics', $store->slug);
        $this->assertSame('hanna@bole.test', $store->contact_email);
        // The owner is that one store's admin, and a vendor.
        $this->assertSame('admin', $owner->roleKey());
        $this->assertSame($store->id, (int) $owner->store_id);
        $this->assertTrue($owner->hasRole('vendor'));
        // The store has its locations like any store.
        $this->assertTrue(StockLocation::query()->where('store_id', $store->id)->exists());
        $this->assertSame(VendorApplication::STATUS_APPROVED, VendorApplication::query()->first()->status);
    }

    #[Test]
    public function the_set_password_link_is_shown_once_on_the_vendors_page(): void
    {
        $this->approved();

        // The visit right after approving carries the owner's link; the next one does not.
        $this->on('admin')->actingAs($this->admin)->get(route('admin.vendors.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Vendors/Index')
                ->where('handover.email', 'hanna@bole.test')
                ->where('handover.url', fn ($url) => str_contains((string) $url, '/reset-password/'))
                ->has('applications', 1));

        $this->on('admin')->actingAs($this->admin)->get(route('admin.vendors.index'))
            ->assertInertia(fn ($page) => $page->where('handover', null));
    }

    #[Test]
    public function an_application_needs_a_free_email_and_phone(): void
    {
        $taken = User::factory()->create(['email' => 'taken@x.test', 'phone_number' => '0911999999']);

        $this->on('vendor')->post(route('vendor.apply'), $this->application(['email' => $taken->email, 'phone_number' => $taken->phone_number]))
            ->assertSessionHasErrors(['email', 'phone_number']);
        $this->assertSame(0, VendorApplication::query()->count());
    }

    #[Test]
    public function a_rejection_keeps_the_reason_and_nothing_is_created(): void
    {
        $this->on('vendor')->post(route('vendor.apply'), $this->application());
        $application = VendorApplication::query()->firstOrFail();

        $this->on('admin')->actingAs($this->admin)->post(route('admin.vendors.reject', $application), [])->assertSessionHasErrors('reason');
        $this->on('admin')->actingAs($this->admin)->post(route('admin.vendors.reject', $application), ['reason' => 'No trade licence'])->assertSessionHas('success');

        $this->assertSame('No trade licence', $application->fresh()->reject_reason);
        $this->assertFalse(Store::query()->where('name', 'Bole Electronics')->exists());
        // Reviewed once: it cannot be approved afterwards.
        $this->on('admin')->actingAs($this->admin)->post(route('admin.vendors.approve', $application))->assertSessionHas('error');
    }

    #[Test]
    public function only_a_global_admin_reviews_applications(): void
    {
        $this->on('vendor')->post(route('vendor.apply'), $this->application());
        $storeAdmin = User::factory()->create(['role' => 'admin', 'store_id' => $this->main->id]);
        $storeAdmin->assignRole('admin');

        $this->on('admin')->actingAs($storeAdmin)->get(route('admin.vendors.index'))->assertForbidden();
        $this->on('admin')->actingAs($storeAdmin)->post(route('admin.vendors.approve', VendorApplication::query()->first()))->assertForbidden();
        $this->assertSame(VendorApplication::STATUS_PENDING, VendorApplication::query()->first()->status);
    }

    #[Test]
    public function the_owner_signing_in_on_the_vendor_site_stays_there(): void
    {
        $store = $this->approved();
        $store->owner->forceFill(['password' => \Illuminate\Support\Facades\Hash::make('secret-pass')])->save();
        auth()->logout();

        $location = (string) $this->post('http://vendor.'.config('app.system_domain').'/login', ['email' => $store->owner->email, 'password' => 'secret-pass'])
            ->assertRedirect()->headers->get('Location');

        // Not sent over to admin.<domain>, although their main role is admin.
        $this->assertStringNotContainsString('admin.', $location);
        $this->assertStringContainsString('/dashboard', $location);
    }

    // ---- The vendor app: their own store only ----

    #[Test]
    public function the_owner_sees_their_store_and_its_orders_but_not_another_stores(): void
    {
        $store = $this->approved();
        $mine = Sale::query()->create(['store_id' => $store->id, 'total_amount' => 300, 'reference_number' => 'SALE-MINE']);
        $theirs = Sale::query()->create(['store_id' => $this->main->id, 'total_amount' => 900, 'reference_number' => 'SALE-THEIRS']);

        $this->on('vendor')->actingAs($store->owner)->get(route('vendor.dashboard'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Vendor/Dashboard/index')
                ->where('store.slug', 'bole-electronics')
                ->has('recent_orders', 1)
                ->where('recent_orders.0.reference', 'SALE-MINE'));

        $this->on('vendor')->actingAs($store->owner)->get(route('vendor.orders.show', $mine))->assertOk();
        $this->on('vendor')->actingAs($store->owner)->get(route('vendor.orders.show', $theirs))->assertNotFound();
    }

    #[Test]
    public function the_owner_edits_the_store_profile_but_never_another_store(): void
    {
        $store = $this->approved();

        $this->on('vendor')->actingAs($store->owner)->patch(route('vendor.store.update'), [
            'store_id' => $store->id, 'slug' => 'bole-phones', 'description' => 'Phones.', 'contact_phone' => '0911', 'contact_email' => 'shop@bole.test',
        ])->assertSessionHas('success');
        $this->assertSame('bole-phones', $store->fresh()->slug);

        $this->on('vendor')->actingAs($store->owner)->patch(route('vendor.store.update'), [
            'store_id' => $this->main->id, 'slug' => 'taken-over',
        ])->assertForbidden();
        $this->assertNotSame('taken-over', $this->main->fresh()->slug);

        $this->on('vendor')->actingAs($store->owner)->patch(route('vendor.store.update'), [
            'store_id' => $store->id, 'slug' => 'Not A Slug!',
        ])->assertSessionHasErrors('slug');
    }

    #[Test]
    public function a_vendor_login_with_no_store_sees_that_instead_of_someone_elses(): void
    {
        $old = User::factory()->create(['role' => 'vendor']);
        $old->assignRole('vendor');

        $this->on('vendor')->actingAs($old)->get(route('vendor.dashboard'))->assertOk()
            ->assertInertia(fn ($page) => $page->where('store', null));
    }

    // ---- V2: Duka's main hubs only under contract ----

    #[Test]
    public function a_vendor_store_reaches_the_main_hubs_only_under_contract(): void
    {
        $store = $this->approved();
        Store::factory()->create(['name' => 'Hub A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $hub = StockLocation::query()->where('kind', StockLocation::KIND_MAIN_HUB)->firstOrFail();
        $floor = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_BACKROOM)->firstOrFail();
        $domain = app(\App\Services\Fulfillment\MovementDomainService::class);
        $hubIn = fn (Store $s): bool => collect($domain->hierarchyFor($s->fresh()))->contains(fn (array $n): bool => $n['kind'] === \App\Services\Fulfillment\MovementDomainService::NODE_MAIN_WAREHOUSE);

        // No contract: checkout and pick & pack never look at the hubs, and no shipment comes from one.
        $this->assertFalse($store->mayUseMainHubs());
        $this->assertFalse($hubIn($store));
        $this->assertTrue($hubIn($this->main));
        try {
            app(\App\Services\ShipmentWorkflowService::class)->createBetween($hub, $floor, [], $this->admin->id);
            $this->fail('A hub shipment to a vendor store without a contract went through.');
        } catch (\App\Exceptions\MovementDomainException $e) {
            $this->assertStringContainsString('hub contract', $e->getMessage());
        }

        // A global admin signs the contract on the Vendors page; a store admin cannot.
        $storeAdmin = User::factory()->create(['role' => 'admin', 'store_id' => $this->main->id]);
        $storeAdmin->assignRole('admin');
        $this->on('admin')->actingAs($storeAdmin)->post(route('admin.vendors.hubs', $store), ['on' => true])->assertForbidden();
        $this->on('admin')->actingAs($this->admin)->post(route('admin.vendors.hubs', $store), ['on' => true])->assertSessionHas('success');

        $this->assertTrue($store->fresh()->mayUseMainHubs());
        $this->assertTrue($hubIn($store));
        $this->assertNotNull(app(\App\Services\ShipmentWorkflowService::class)->createBetween($hub, $floor, [], $this->admin->id)->id);
    }

    // ---- V3: commission and payouts ----

    #[Test]
    public function a_paid_vendor_order_earns_its_share_once_and_a_cancelled_one_gives_it_back(): void
    {
        $store = $this->approved();
        $sale = Sale::query()->create(['store_id' => $store->id, 'total_amount' => 1000, 'reference_number' => 'SALE-V1']);
        $duka = Sale::query()->create(['store_id' => $this->main->id, 'total_amount' => 500, 'reference_number' => 'SALE-D1']);
        $money = app(\App\Services\Vendor\VendorMoney::class);

        $sale->update(['payment_status' => 'paid']);
        $duka->update(['payment_status' => 'paid']);

        // The default 10%: 1000 earns 900; Duka's own store keeps no ledger.
        $earning = \App\Models\Vendor\VendorLedgerEntry::query()->where('sale_id', $sale->id)->sole();
        $this->assertSame([1000.0, 100.0, 900.0], [$earning->gross, $earning->commission, $earning->amount]);
        $this->assertSame(0, \App\Models\Vendor\VendorLedgerEntry::query()->where('sale_id', $duka->id)->count());
        $this->assertSame(900.0, $money->balance($store));

        // Paid again (a status written twice) earns nothing more.
        $sale->update(['payment_status' => 'partially_paid']);
        $sale->update(['payment_status' => 'paid']);
        $this->assertSame(900.0, $money->balance($store));

        $sale->update(['fulfillment_stage' => Sale::STAGE_CANCELLED]);
        $this->assertSame(0.0, $money->balance($store));
    }

    #[Test]
    public function a_payout_needs_two_people_and_never_more_than_is_owed(): void
    {
        $store = $this->approved();
        Sale::query()->create(['store_id' => $store->id, 'total_amount' => 1000, 'reference_number' => 'SALE-V2'])->update(['payment_status' => 'paid']);
        $second = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $second->assignRole('admin');
        $money = app(\App\Services\Vendor\VendorMoney::class);

        $this->on('admin')->actingAs($this->admin)->post(route('admin.vendors.payouts.store', $store), ['amount' => 950, 'method' => 'bank_transfer'])->assertSessionHas('error');
        $this->on('admin')->actingAs($this->admin)->post(route('admin.vendors.payouts.store', $store), ['amount' => 600, 'method' => 'bank_transfer', 'reference' => 'TX-1'])->assertSessionHas('success');
        $payout = \App\Models\Vendor\VendorPayout::query()->sole();

        // Waiting payouts count against what is left to pay out.
        $this->on('admin')->actingAs($this->admin)->post(route('admin.vendors.payouts.store', $store), ['amount' => 400, 'method' => 'cash'])->assertSessionHas('error');

        // The recorder cannot confirm; a second global admin can.
        $this->on('admin')->actingAs($this->admin)->post(route('admin.vendors.payouts.confirm', $payout))->assertSessionHas('error');
        $this->assertSame(900.0, $money->balance($store));
        $this->on('admin')->actingAs($second)->post(route('admin.vendors.payouts.confirm', $payout))->assertSessionHas('success');
        $this->assertSame(300.0, $money->balance($store));

        // The vendor sees it.
        $this->on('vendor')->actingAs($store->owner)->get(route('vendor.money.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Vendor/Money/index')->where('balance', 300)->has('payouts', 1));

        // A store admin never reaches vendors' money.
        $storeAdmin = User::factory()->create(['role' => 'admin', 'store_id' => $this->main->id]);
        $storeAdmin->assignRole('admin');
        $this->on('admin')->actingAs($storeAdmin)->post(route('admin.vendors.commission'), ['commission_pct' => 0])->assertForbidden();
    }

    #[Test]
    public function finance_is_the_second_person_for_a_payout_an_admin_recorded(): void
    {
        Role::firstOrCreate(['name' => 'finance']);
        $store = $this->approved();
        Sale::query()->create(['store_id' => $store->id, 'total_amount' => 1000, 'reference_number' => 'SALE-F1'])->update(['payment_status' => 'paid']);
        $finance = User::factory()->create(['role' => 'finance']);
        $finance->assignRole('finance');

        $this->on('admin')->actingAs($this->admin)->post(route('admin.vendors.payouts.store', $store), ['amount' => 500, 'method' => 'telebirr'])->assertSessionHas('success');
        $payout = \App\Models\Vendor\VendorPayout::query()->sole();

        $this->on('finance')->actingAs($finance)->get(route('finance.vendor_payouts.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Finance/VendorPayouts/Index')
                ->where('stores.0.balance', 900)
                ->where('payouts.0.recorded_by_me', false));
        $this->on('finance')->actingAs($finance)->post(route('finance.vendor_payouts.confirm', $payout))->assertSessionHas('success');
        $this->assertSame(400.0, app(\App\Services\Vendor\VendorMoney::class)->balance($store));

        // A store admin passes the finance app's gate, but not the money.
        $storeAdmin = User::factory()->create(['role' => 'admin', 'store_id' => $this->main->id]);
        $storeAdmin->assignRole('admin');
        $this->on('finance')->actingAs($storeAdmin)->get(route('finance.vendor_payouts.index'))->assertForbidden();
        $this->on('finance')->actingAs($storeAdmin)->post(route('finance.vendor_payouts.store', $store), ['amount' => 10, 'method' => 'cash'])->assertForbidden();
    }

    #[Test]
    public function the_commission_set_now_applies_to_orders_paid_from_now_on(): void
    {
        $store = $this->approved();
        $this->on('admin')->actingAs($this->admin)->post(route('admin.vendors.commission'), ['commission_pct' => 15])->assertSessionHas('success');

        Sale::query()->create(['store_id' => $store->id, 'total_amount' => 200, 'reference_number' => 'SALE-V3'])->update(['payment_status' => 'paid']);

        $this->assertSame(170.0, app(\App\Services\Vendor\VendorMoney::class)->balance($store));
    }

    // ---- The shop: one page per store ----

    #[Test]
    public function each_store_has_its_own_shop_page_and_cart_while_shop_stays_the_default(): void
    {
        $store = $this->approved();
        $item = Item::factory()->create(['status' => 'active', 'product_name' => 'USB charger']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id' => $store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id, 'active' => true,
            'pricing_matrix' => ['price' => 150.0, 'discount_price' => null, 'discount_ends_at' => null],
        ]);
        ItemStock::updateOrCreate(
            ['item_variant_id' => $variant->id, 'location_type' => Store::class, 'location_id' => $store->id],
            ['quantity' => 10, 'min_stock_level' => 0],
        );

        $this->get(route('storefront.store', $store->slug))->assertOk()
            ->assertInertia(fn ($page) => $page->where('store.id', $store->id)->where('store.explicit', true));
        $this->get(route('storefront.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->where('store.id', $this->main->id)->where('store.explicit', false));
        $this->get(route('storefront.store', 'no-such-store'))->assertNotFound();

        // A line added on the store's page lands in that store's cart.
        $this->post(route('storefront.cart.items.store'), ['store' => $store->slug, 'variant_id' => $variant->id, 'quantity' => 1]);
        $this->assertTrue(Cart::query()->where('store_id', $store->id)->exists());
        $this->assertFalse(Cart::query()->where('store_id', $this->main->id)->exists());
    }

    #[Test]
    public function one_search_finds_items_in_every_store_grouped_by_store(): void
    {
        $store = $this->approved();
        foreach ([[$store, 'USB charger fast'], [$this->main, 'USB cable'], [$this->main, 'Notebook']] as [$where, $name]) {
            $item = Item::factory()->create(['status' => 'active', 'product_name' => $name]);
            $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
            StoreVariant::factory()->create([
                'store_id' => $where->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id, 'active' => true,
                'pricing_matrix' => ['price' => 100.0, 'discount_price' => null, 'discount_ends_at' => null],
            ]);
        }

        // The shop's own domain: admin.<domain> has a /stores of its own.
        $market = 'http://'.config('app.system_domain').'/stores';
        $this->get($market)->assertOk()
            ->assertInertia(fn ($page) => $page->component('User/Stores/Index')->has('stores', 2)->where('results', []));

        $this->get("{$market}?q=usb")->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('results', 2)
                ->where('results', fn ($results) => collect($results)->pluck('total')->sort()->values()->all() === [1, 1]
                    && collect($results)->flatMap(fn ($r) => collect($r['items'])->pluck('title'))->sort()->values()->all() === ['USB cable', 'USB charger fast']));

        // A closed store is not on the marketplace.
        $store->update(['status' => 'inactive']);
        $this->get("{$market}?q=usb")->assertInertia(fn ($page) => $page->has('results', 1));
    }

    #[Test]
    public function a_shopper_reviews_a_store_only_after_an_order_reached_them_and_once(): void
    {
        $store = $this->approved();
        $shopper = User::factory()->create(['role' => 'user', 'first_name' => 'Abel', 'last_name' => 'Girma']);
        $shop = 'http://'.config('app.system_domain');
        $review = fn (array $data) => $this->actingAs($shopper)->post("{$shop}/s/{$store->slug}/reviews", $data);

        // No delivered order from this store yet: refused, and the page offers no form.
        $review(['rating' => 5])->assertSessionHasErrors('rating');
        $this->actingAs($shopper)->get("{$shop}/s/{$store->slug}")->assertInertia(fn ($page) => $page->where('reviews.can_review', false));

        // The store's seller rang it up (sales.user_id); the buyer is its customer, by email.
        $seller = User::factory()->create(['role' => 'seller', 'store_id' => $store->id]);
        $customer = \App\Models\Auth\Customer::factory()->create(['email' => $shopper->email, 'store_id' => $store->id]);
        $sale = Sale::query()->create(['store_id' => $store->id, 'user_id' => $seller->id, 'customer_id' => $customer->id, 'total_amount' => 100, 'reference_number' => 'SALE-R1']);
        $sale->forceFill(['fulfillment_stage' => Sale::STAGE_DELIVERED])->save();

        // The seller who sold it never reviews their own store.
        $this->actingAs($seller)->post("{$shop}/s/{$store->slug}/reviews", ['rating' => 5])->assertSessionHasErrors('rating');

        $review(['rating' => 4, 'comment' => 'Quick and kind.'])->assertSessionHas('success');
        $review(['rating' => 2, 'comment' => 'Changed my mind.'])->assertSessionHas('success');
        $this->assertSame(1, \App\Models\Store\StoreReview::query()->count());

        $this->actingAs($shopper)->get("{$shop}/s/{$store->slug}")->assertInertia(fn ($page) => $page
            ->where('reviews.average', 2)
            ->where('reviews.count', 1)
            ->where('reviews.latest.0.by', 'Abel G')
            ->where('reviews.mine.rating', 2));

        // A global admin hides it; it leaves the page and the average. A store admin cannot.
        $hidden = \App\Models\Store\StoreReview::query()->sole();
        $storeAdmin = User::factory()->create(['role' => 'admin', 'store_id' => $this->main->id]);
        $storeAdmin->assignRole('admin');
        $this->on('admin')->actingAs($storeAdmin)->post(route('admin.vendors.reviews.hide', $hidden))->assertForbidden();
        $this->on('admin')->actingAs($this->admin)->post(route('admin.vendors.reviews.hide', $hidden))->assertSessionHas('success');
        $this->get("{$shop}/s/{$store->slug}")->assertInertia(fn ($page) => $page->where('reviews.count', 0)->where('reviews.average', null));
    }

    #[Test]
    public function one_basket_holds_carts_from_several_stores_and_checks_out_one_order_per_store(): void
    {
        $store = $this->approved();
        $shopper = User::factory()->create(['role' => 'user']);
        $shop = 'http://'.config('app.system_domain');
        $variants = [];
        foreach ([$store, $this->main] as $where) {
            $item = Item::factory()->create(['status' => 'active']);
            $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
            StoreVariant::factory()->create([
                'store_id' => $where->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id, 'active' => true,
                'pricing_matrix' => ['price' => 50.0, 'discount_price' => null, 'discount_ends_at' => null],
            ]);
            ItemStock::updateOrCreate(
                ['item_variant_id' => $variant->id, 'location_type' => Store::class, 'location_id' => $where->id],
                ['quantity' => 10, 'min_stock_level' => 0],
            );
            $variants[$where->id] = $variant;
        }

        $this->actingAs($shopper)->post("{$shop}/shop/cart/items", ['store' => $store->slug, 'variant_id' => $variants[$store->id]->id, 'quantity' => 2]);
        $this->actingAs($shopper)->post("{$shop}/shop/cart/items", ['variant_id' => $variants[$this->main->id]->id, 'quantity' => 1]);

        // Either store's page shows the whole basket: two stores, three items.
        $this->actingAs($shopper)->get("{$shop}/s/{$store->slug}")->assertInertia(fn ($page) => $page
            ->has('basket.stores', 2)
            ->where('basket.item_count', 3)
            ->where('cart.item_count', 2));

        // "Check out everything" goes on to one checkout page holding both stores: an order each.
        $this->actingAs($shopper)->post("{$shop}/shop/checkout-all", [])->assertRedirect(route('storefront.checkout.show'));
        $this->actingAs($shopper)->get("{$shop}/shop/checkout")->assertOk()->assertInertia(fn ($page) => $page
            ->component('User/Checkout/Index')
            ->has('stores', 2)
            ->where('stores', fn ($stores) => collect($stores)->pluck('store.name')->sort()->values()->all() === collect([$store->name, 'Main Store'])->sort()->values()->all()));
    }

    #[Test]
    public function a_guest_sees_the_welcome_page_but_not_the_app(): void
    {
        $this->on('vendor')->get(route('vendor.welcome'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Vendor/Welcome/index'));

        foreach (['vendor.dashboard', 'vendor.catalogue.index', 'vendor.orders.index', 'vendor.store.edit', 'vendor.profile.index'] as $name) {
            $this->on('vendor')->get(route($name))->assertRedirect(route('vendor.login'));
        }
    }
}
