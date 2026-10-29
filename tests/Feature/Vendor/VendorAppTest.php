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
    public function a_guest_sees_the_welcome_page_but_not_the_app(): void
    {
        $this->on('vendor')->get(route('vendor.welcome'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Vendor/Welcome/index'));

        foreach (['vendor.dashboard', 'vendor.catalogue.index', 'vendor.orders.index', 'vendor.store.edit', 'vendor.profile.index'] as $name) {
            $this->on('vendor')->get(route($name))->assertRedirect(route('vendor.login'));
        }
    }
}
