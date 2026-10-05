<?php

declare(strict_types=1);

namespace Tests\Feature\Vendor;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Procurement\Purchase;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The Vendor app: a supplier sees only the SKUs they own and the purchase
 * orders placed with them, and can edit their own profile.
 */
class VendorAppTest extends TestCase
{
    use RefreshDatabase;

    private User $vendor;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['vendor', 'admin'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['name' => 'Main Store']);
        $this->vendor = $this->user('vendor');

        $this->withServerVariables(['HTTP_HOST' => 'vendor.'.config('app.system_domain')]);
        $this->actingAs($this->vendor);
    }

    private function user(string $role, array $overrides = []): User
    {
        $user = User::factory()->create(['role' => $role] + $overrides);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function variantFor(User $owner, string $name = 'Bic Pen'): ItemVariant
    {
        $item = Item::factory()->create(['product_name' => $name, 'status' => 'active']);

        return ItemVariant::factory()->create(['item_id' => $item->id, 'owner_id' => $owner->id]);
    }

    private function purchase(User $vendor, string $status = 'pending', float $total = 100, array $overrides = []): Purchase
    {
        static $n = 0;

        return Purchase::query()->create($overrides + [
            'reference_number' => 'PO-'.str_pad((string) ++$n, 4, '0', STR_PAD_LEFT),
            'store_id' => $this->store->id,
            'vendor_id' => $vendor->id,
            'total_amount' => $total,
            'status' => $status,
            'user_id' => $this->user('admin')->id,
        ]);
    }

    #[Test]
    public function the_dashboard_shows_my_metrics_orders_and_catalogue(): void
    {
        $mine = $this->variantFor($this->vendor);
        $this->variantFor($this->user('vendor'), 'Not mine');
        ItemStock::query()->create(['item_variant_id' => $mine->id, 'location_type' => Store::class, 'location_id' => $this->store->id, 'quantity' => 12, 'min_stock_level' => 0]);
        $this->purchase($this->vendor, 'pending', 100);
        $this->purchase($this->vendor, 'received', 250);
        $this->purchase($this->user('vendor'), 'received', 999);

        $this->get(route('vendor.dashboard'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Vendor/Dashboard/index')
                ->where('metrics.catalogue_skus', 1)
                ->where('metrics.units_in_network', 12)
                ->where('metrics.orders_total', 2)
                ->where('metrics.orders_pending', 1)
                ->where('metrics.orders_received', 1)
                ->where('metrics.revenue_received', fn ($v) => (float) $v === 250.0)
                ->where('metrics.revenue_pending', fn ($v) => (float) $v === 100.0)
                ->where('recent_orders', fn ($rows) => count($rows) === 2)
                ->where('catalogue_preview', fn ($rows) => count($rows) === 1 && $rows[0]['units_in_network'] === 12)
                ->where('vendor.id', $this->vendor->id));
    }

    #[Test]
    public function the_dashboard_opens_for_a_vendor_with_nothing_yet(): void
    {
        $this->get(route('vendor.dashboard'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('metrics.catalogue_skus', 0)
                ->where('metrics.orders_total', 0)
                ->where('recent_orders', [])
                ->where('catalogue_preview', []));
    }

    #[Test]
    public function the_catalogue_lists_only_my_skus_and_can_be_searched(): void
    {
        $pen = $this->variantFor($this->vendor, 'Bic Pen');
        $this->variantFor($this->vendor, 'Notebook');
        $this->variantFor($this->user('vendor'), 'Stapler');

        $this->get(route('vendor.catalogue.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Vendor/Catalogue/index')->where('pagination.total', 2));

        $this->get(route('vendor.catalogue.index', ['search' => 'Bic']))
            ->assertInertia(fn ($page) => $page->where('pagination.total', 1)->where('variants.0.id', $pen->id));
        $this->get(route('vendor.catalogue.index', ['search' => $pen->sku]))
            ->assertInertia(fn ($page) => $page->where('pagination.total', 1));
        $this->get(route('vendor.catalogue.index', ['search' => 'Stapler']))
            ->assertInertia(fn ($page) => $page->where('pagination.total', 0));
    }

    #[Test]
    public function the_order_list_shows_only_my_orders_with_counts_filters_and_search(): void
    {
        $a = $this->purchase($this->vendor, 'pending', 100, ['notes' => 'urgent restock']);
        $this->purchase($this->vendor, 'received', 50);
        $this->purchase($this->vendor, 'canceled', 10);
        $this->purchase($this->user('vendor'), 'pending', 999);

        $this->get(route('vendor.orders.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Vendor/Orders/index')
                ->where('counts', ['all' => 3, 'pending' => 1, 'received' => 1, 'canceled' => 1])
                ->where('pagination.total', 3));

        $this->get(route('vendor.orders.index', ['status' => 'received']))
            ->assertInertia(fn ($page) => $page->where('pagination.total', 1)->where('orders.0.status', 'received'));
        $this->get(route('vendor.orders.index', ['search' => $a->reference_number]))
            ->assertInertia(fn ($page) => $page->where('pagination.total', 1)->where('orders.0.id', $a->id));
        $this->get(route('vendor.orders.index', ['search' => 'urgent']))
            ->assertInertia(fn ($page) => $page->where('pagination.total', 1));
    }

    #[Test]
    public function a_vendor_opens_their_own_order_but_not_another_vendors(): void
    {
        $mine = $this->purchase($this->vendor, 'pending', 120);
        $theirs = $this->purchase($this->user('vendor'), 'pending', 80);

        $this->get(route('vendor.orders.show', $mine))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Vendor/Orders/Show')
                ->where('order.reference_number', $mine->reference_number)
                ->where('order.store', 'Main Store'));

        $this->get(route('vendor.orders.show', $theirs))->assertForbidden();
    }

    #[Test]
    public function the_profile_page_shows_the_vendor_and_their_numbers(): void
    {
        $this->get(route('vendor.profile.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Vendor/Profile/index')
                ->where('vendor.id', $this->vendor->id)
                ->has('metrics'));
    }

    #[Test]
    public function a_vendor_updates_their_profile_and_may_keep_their_own_email_and_phone(): void
    {
        $this->vendor->update(['phone_number' => '0911222333']);

        $this->patch(route('vendor.profile.update'), [
            'first_name' => 'Almaz', 'last_name' => 'T', 'email' => $this->vendor->email, 'phone_number' => '0911222333',
        ])->assertSessionHasNoErrors()->assertSessionHas('success');

        $this->assertSame('Almaz', $this->vendor->fresh()->first_name);
    }

    #[Test]
    public function a_profile_needs_a_name_and_email_and_cannot_take_anothers_email_or_phone(): void
    {
        $this->user('vendor', ['email' => 'taken@example.com', 'phone_number' => '0911999888']);

        $this->patch(route('vendor.profile.update'), [])->assertSessionHasErrors(['first_name', 'email']);
        $this->patch(route('vendor.profile.update'), [
            'first_name' => 'X', 'email' => 'taken@example.com', 'phone_number' => '0911999888',
        ])->assertSessionHasErrors(['email', 'phone_number']);
        $this->patch(route('vendor.profile.update'), [
            'first_name' => 'X', 'email' => $this->vendor->email, 'phone_number' => str_repeat('1', 16),
        ])->assertSessionHasErrors('phone_number');
    }

    #[Test]
    public function a_guest_sees_the_welcome_page_but_not_the_app(): void
    {
        auth()->logout();
        $this->app['auth']->forgetGuards();

        $this->get(route('vendor.welcome'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Vendor/Welcome/index'));

        foreach (['vendor.dashboard', 'vendor.catalogue.index', 'vendor.orders.index', 'vendor.profile.index'] as $name) {
            $this->get(route($name))->assertRedirect(route('vendor.login'));
        }
        $this->patch(route('vendor.profile.update'), [])->assertRedirect(route('vendor.login'));
    }
}
