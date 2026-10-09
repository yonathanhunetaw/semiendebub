<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Canvas\Canvas;
use App\Models\Canvas\CanvasVersion;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Global admin vs store admin.
 *
 * One `admin` role: no store = global admin (every store, "All stores", the
 * global zone); a store = store admin, locked to it (plus stores they manage).
 * A store admin must not read or write another store's records, whatever the
 * query string or the form says, and typed global URLs must 403.
 */
class AdminStoreScopeTest extends TestCase
{
    use RefreshDatabase;

    private Store $own;

    private Store $other;

    private User $global;

    private User $storeAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->own = Store::factory()->create(['name' => 'Own Store', 'type' => Store::TYPE_RETAIL]);
        $this->other = Store::factory()->create(['name' => 'Other Store', 'type' => Store::TYPE_RETAIL]);

        $this->global = $this->user('admin', null);
        $this->storeAdmin = $this->user('admin', $this->own->id);

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
    }

    private function user(string $role, ?int $storeId, array $attributes = []): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId, ...$attributes]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function customer(Store $store, string $name): Customer
    {
        static $n = 0;
        $n++;

        return Customer::query()->create([
            'first_name' => $name,
            'email' => "c{$n}@example.com",
            'phone_number' => '09110000'.str_pad((string) $n, 2, '0', STR_PAD_LEFT),
            'store_id' => $store->id,
            'created_by' => $this->global->id,
        ]);
    }

    // ---- Shared props and the active store ----------------------------------

    #[Test]
    public function a_global_admin_starts_on_all_stores_and_the_choice_is_remembered(): void
    {
        $this->actingAs($this->global);

        $this->get(route('admin.customers.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('isGlobalAdmin', true)
                ->where('activeStore.id', 'all')
                ->has('accessibleStores', 2));

        $this->get(route('admin.customers.index', ['store' => $this->other->id]))
            ->assertInertia(fn ($page) => $page->where('activeStore.id', $this->other->id));

        // A plain link keeps the store the dropdown picked.
        $this->get(route('admin.orders.index'))
            ->assertInertia(fn ($page) => $page->where('activeStore.id', $this->other->id)->where('activeStore.name', 'Other Store'));

        $this->get(route('admin.orders.index', ['store' => 'all']))
            ->assertInertia(fn ($page) => $page->where('activeStore.id', 'all'));
    }

    #[Test]
    public function a_store_admin_is_locked_to_their_store_whatever_the_query_says(): void
    {
        $this->actingAs($this->storeAdmin);

        foreach ([$this->other->id, 'all', 'nonsense', 99999] as $requested) {
            $this->get(route('admin.customers.index', ['store' => $requested]))->assertOk()
                ->assertInertia(fn ($page) => $page
                    ->where('isGlobalAdmin', false)
                    ->where('activeStore.id', $this->own->id)
                    ->has('accessibleStores', 1)
                    ->where('accessibleStores.0.id', $this->own->id));
        }
    }

    #[Test]
    public function a_store_they_manage_is_also_reachable(): void
    {
        $this->other->syncManagers([$this->storeAdmin->id]);
        $this->actingAs($this->storeAdmin);

        $this->get(route('admin.customers.index', ['store' => $this->other->id]))
            ->assertInertia(fn ($page) => $page->where('activeStore.id', $this->other->id)->has('accessibleStores', 2));
    }

    // ---- Global zone --------------------------------------------------------

    #[Test]
    public function a_store_admin_typing_a_global_url_gets_a_403(): void
    {
        $this->actingAs($this->storeAdmin);

        foreach ([
            route('admin.items.index'),
            route('admin.inventory.stores'),
            route('admin.inventory.warehouse.index'),
            route('admin.inventory.fleet.index'),
            route('admin.sessions.index'),
            route('store.index'),
        ] as $url) {
            $this->get($url)->assertForbidden();
        }

        $this->actingAs($this->global);
        $this->get(route('admin.items.index'))->assertOk();
        $this->get(route('admin.inventory.fleet.index'))->assertOk();
    }

    // ---- Customers ----------------------------------------------------------

    #[Test]
    public function customers_follow_the_active_store(): void
    {
        $this->customer($this->own, 'Mine');
        $this->customer($this->other, 'Theirs');

        $this->actingAs($this->storeAdmin);
        $this->get(route('admin.customers.index'))
            ->assertInertia(fn ($page) => $page->has('customers', 1)->where('customers.0.first_name', 'Mine'));

        $this->actingAs($this->global);
        $this->get(route('admin.customers.index', ['store' => 'all']))->assertInertia(fn ($page) => $page->has('customers', 2));
        $this->get(route('admin.customers.index', ['store' => $this->other->id]))
            ->assertInertia(fn ($page) => $page->has('customers', 1)->where('customers.0.first_name', 'Theirs'));
    }

    #[Test]
    public function a_store_admin_cannot_touch_another_stores_customer_and_new_ones_land_in_their_store(): void
    {
        $theirs = $this->customer($this->other, 'Theirs');
        $this->actingAs($this->storeAdmin);

        $this->put(route('admin.customers.update', $theirs), [
            'first_name' => 'Hijacked', 'email' => 'x@example.com', 'phone_number' => '0911999999',
        ])->assertNotFound();
        $this->delete(route('admin.customers.destroy', $theirs))->assertNotFound();
        $this->assertSame('Theirs', $theirs->fresh()->first_name);

        $this->post(route('admin.customers.store'), [
            'first_name' => 'New', 'email' => 'new@example.com', 'phone_number' => '0911888888',
            'store_id' => $this->other->id,
        ])->assertSessionHasNoErrors();

        $this->assertSame($this->own->id, (int) Customer::query()->where('email', 'new@example.com')->value('store_id'));
    }

    // ---- Users --------------------------------------------------------------

    #[Test]
    public function users_and_sessions_are_for_global_admins_only(): void
    {
        $mine = $this->user('seller', $this->own->id);
        $this->actingAs($this->storeAdmin);

        $this->get(route('admin.users.index'))->assertForbidden();
        $this->get(route('admin.users.edit', $mine))->assertForbidden();
        $this->post(route('admin.users.store'), ['first_name' => 'X'])->assertForbidden();
        $this->get(route('admin.sessions.index'))->assertForbidden();
        $this->get(route('admin.settings'))->assertOk();

        $this->actingAs($this->global);
        $this->get(route('admin.users.index'))->assertOk();
        $this->get(route('admin.sessions.index'))->assertOk();
    }

    #[Test]
    public function a_global_admin_sees_every_user_and_may_make_a_store_admin(): void
    {
        $this->user('seller', $this->other->id);
        $this->actingAs($this->global);

        $this->get(route('admin.users.index', ['store' => 'all']))
            ->assertInertia(fn ($page) => $page->where('users', fn ($users) => count($users) === User::query()->count()));

        $this->post(route('admin.users.store'), [
            'first_name' => 'Boss', 'email' => 'boss@example.com', 'role' => 'admin', 'store_id' => $this->other->id,
            'password' => 'password123', 'password_confirmation' => 'password123',
        ])->assertSessionHasNoErrors();

        $boss = User::query()->where('email', 'boss@example.com')->sole();
        $this->assertSame([$this->other->id, 'admin'], [(int) $boss->store_id, $boss->roleKey()]);
    }

    // ---- Carts, orders, deliveries, payments --------------------------------

    #[Test]
    public function carts_are_scoped_and_a_store_admins_new_cart_is_for_their_store(): void
    {
        Cart::query()->create(['store_id' => $this->own->id, 'status' => 'open', 'session_id' => '1']);
        $theirs = Cart::query()->create(['store_id' => $this->other->id, 'status' => 'open', 'session_id' => '2']);

        $this->actingAs($this->storeAdmin);
        $this->get(route('admin.carts.index'))->assertInertia(fn ($page) => $page->where('carts.total', 1));
        $this->get(route('admin.carts.show', $theirs))->assertNotFound();
        $this->delete(route('admin.carts.destroy', $theirs->id))->assertNotFound();

        $this->post(route('admin.carts.store'), ['store_id' => $this->other->id])->assertRedirect();
        $this->assertSame(2, Cart::query()->where('store_id', $this->own->id)->count());
        $this->assertSame(1, Cart::query()->where('store_id', $this->other->id)->count());
    }

    #[Test]
    public function orders_deliveries_and_payments_follow_the_active_store(): void
    {
        $mine = Sale::query()->create(['store_id' => $this->own->id, 'total_amount' => 10, 'reference_number' => 'SALE-MINE']);
        $theirs = Sale::query()->create(['store_id' => $this->other->id, 'total_amount' => 20, 'reference_number' => 'SALE-THEIRS']);
        foreach ([$mine, $theirs] as $sale) {
            Delivery::query()->create(['sale_id' => $sale->id, 'tracking_number' => 'TRK-'.$sale->id, 'status' => 'pending']);
            Payment::query()->create(['sale_id' => $sale->id, 'payment_method' => 'cash', 'amount' => $sale->total_amount, 'status' => Payment::STATUS_CONFIRMED, 'paid_at' => now()]);
        }

        $this->actingAs($this->storeAdmin);

        $this->get(route('admin.orders.index', ['store' => $this->other->id]))
            ->assertInertia(fn ($page) => $page->has('orders', 1)->where('orders.0.reference', 'SALE-MINE'));
        $this->get(route('admin.orders.custody', 'SALE-THEIRS'))->assertNotFound();
        $this->get(route('admin.deliveries.index', ['status' => 'all']))
            ->assertInertia(fn ($page) => $page->has('deliveries', 1)->where('deliveries.0.order', 'SALE-MINE'));
        $this->get(route('admin.payments.index'))
            ->assertInertia(fn ($page) => $page->has('payments', 1)->where('payments.0.order', 'SALE-MINE')->where('today.0.total', 10));

        $this->actingAs($this->global);
        $this->get(route('admin.orders.index', ['store' => 'all']))->assertInertia(fn ($page) => $page->has('orders', 2));
        $this->get(route('admin.payments.index'))->assertInertia(fn ($page) => $page->has('payments', 2));
    }

    #[Test]
    public function payment_accounts_are_scoped_and_a_store_admin_cannot_add_one_elsewhere(): void
    {
        $theirSeller = $this->user('seller', $this->other->id);
        $account = PaymentAccount::query()->create([
            'store_id' => $this->other->id, 'type' => 'bank', 'provider' => 'cbe', 'account_number' => '1',
            'account_name' => 'X', 'owner_user_id' => $theirSeller->id, 'purpose' => 'collection', 'is_active' => true,
        ]);

        $this->actingAs($this->storeAdmin);
        $this->get(route('admin.payment-accounts.index'))->assertInertia(fn ($page) => $page->has('accounts', 0));
        $this->delete(route('admin.payment-accounts.destroy', $account))->assertNotFound();

        $this->post(route('admin.payment-accounts.store'), [
            'store_id' => $this->other->id, 'type' => 'bank', 'provider' => 'cbe', 'account_number' => '2',
            'account_name' => 'Y', 'owner_user_id' => $theirSeller->id, 'purpose' => 'collection', 'is_active' => true,
        ])->assertForbidden();
        $this->assertSame(1, PaymentAccount::query()->count());
    }

    // ---- Approvals: open to a store manager ---------------------------------

    #[Test]
    public function a_store_manager_may_open_approvals_but_nothing_else_in_the_admin_app(): void
    {
        $manager = $this->user('store_manager', $this->own->id);
        $this->actingAs($manager);

        $this->get(route('admin.inventory.replenishment.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->where('filters.store_id', $this->own->id)->where('isGlobalAdmin', false));
        $this->get(route('admin.dashboard'))->assertForbidden();
        $this->get(route('admin.customers.index'))->assertForbidden();
    }

    // ---- Canvas -------------------------------------------------------------

    #[Test]
    public function a_store_admins_canvas_belongs_to_their_store_and_shares_stay_inside_it(): void
    {
        $colleague = $this->user('seller', $this->own->id);
        $outsider = $this->user('seller', $this->other->id);

        $this->actingAs($this->storeAdmin);
        $this->post(route('admin.canvas.create'), ['title' => 'Shelf plan'])->assertSessionHasNoErrors();
        $canvas = Canvas::query()->where('title', 'Shelf plan')->sole();
        $this->assertSame($this->own->id, $canvas->store_id);

        // The picker offers this store's people and the global admins only.
        $this->get(route('admin.canvas.index', ['canvas_id' => $canvas->id]))->assertInertia(fn ($page) => $page
            ->where('allUsers', fn ($users) => collect($users)->pluck('id')->sort()->values()->all()
                === collect([$colleague->id, $this->global->id])->sort()->values()->all()));

        $this->post(route('admin.canvas.share'), ['canvas_id' => $canvas->id, 'user_id' => $outsider->id, 'permission' => 'view'])
            ->assertSessionHasErrors('user_id');
        $this->post(route('admin.canvas.share'), ['canvas_id' => $canvas->id, 'user_id' => $colleague->id, 'permission' => 'view'])
            ->assertSessionHas('success');
        $this->assertSame([$colleague->id], $canvas->shares()->pluck('users.id')->map(fn ($id) => (int) $id)->all());
    }

    #[Test]
    public function a_share_that_crosses_stores_stays_shut(): void
    {
        $theirAdmin = $this->user('admin', $this->other->id);
        $canvas = Canvas::query()->create(['user_id' => $theirAdmin->id, 'store_id' => $this->other->id, 'title' => 'Theirs']);
        $canvas->shares()->attach($this->storeAdmin->id, ['permission' => 'edit']);
        $version = CanvasVersion::query()->create(['canvas_id' => $canvas->id, 'user_id' => $theirAdmin->id, 'snapshot_json' => ['a' => 1], 'status' => 'pending']);

        $this->actingAs($this->storeAdmin);
        $this->get(route('admin.canvas.index'))->assertInertia(fn ($page) => $page
            ->where('canvases', fn ($rows) => ! collect($rows)->pluck('id')->contains($canvas->id)));
        $this->getJson(route('admin.canvas.version', $version->id))->assertNotFound();
        $this->postJson(route('admin.canvas.save'), ['canvas_id' => $canvas->id, 'snapshot_json' => ['b' => 2]])->assertNotFound();
    }

    #[Test]
    public function a_global_admins_canvas_is_global(): void
    {
        $this->actingAs($this->global);
        $this->post(route('admin.canvas.create'), ['title' => 'HQ'])->assertSessionHasNoErrors();

        $this->assertNull(Canvas::query()->where('title', 'HQ')->value('store_id'));
    }

    // ---- Shell: search and badges -------------------------------------------

    #[Test]
    public function the_quick_search_stays_inside_the_active_store(): void
    {
        Sale::query()->create(['store_id' => $this->own->id, 'total_amount' => 1, 'reference_number' => 'SALE-ABC-1']);
        Sale::query()->create(['store_id' => $this->other->id, 'total_amount' => 1, 'reference_number' => 'SALE-ABC-2']);
        $this->customer($this->own, 'Abebe');
        $this->customer($this->other, 'Abebech');

        $this->actingAs($this->storeAdmin);
        $this->getJson(route('admin.search', ['q' => 'ABC']))->assertOk()
            ->assertJsonCount(1, 'orders')->assertJsonPath('orders.0.label', 'SALE-ABC-1');
        $this->getJson(route('admin.search', ['q' => 'Abe']))->assertJsonCount(1, 'customers');
        $this->getJson(route('admin.search', ['q' => 'A']))->assertExactJson(['orders' => [], 'customers' => [], 'items' => []]);

        $this->actingAs($this->global);
        $this->getJson(route('admin.search', ['q' => 'ABC', 'store' => 'all']))->assertJsonCount(2, 'orders');
    }

    #[Test]
    public function the_sidebar_badges_count_the_active_store(): void
    {
        $this->customer($this->own, 'Mine');
        $this->customer($this->other, 'Theirs');
        Cart::query()->create(['store_id' => $this->own->id, 'status' => 'open', 'session_id' => '1']);
        Sale::query()->create(['store_id' => $this->own->id, 'total_amount' => 1, 'reference_number' => 'SALE-OPEN']);

        $this->actingAs($this->storeAdmin);
        $this->get(route('admin.customers.index'))->assertInertia(fn ($page) => $page
            ->where('adminNav.counts.customers', 1)
            ->where('adminNav.counts.carts', 1)
            ->where('adminNav.counts.orders', 1));

        $this->actingAs($this->global);
        $this->get(route('admin.customers.index', ['store' => 'all']))
            ->assertInertia(fn ($page) => $page->where('adminNav.counts.customers', 2));
    }

    // ---- A store admin's own store page --------------------------------------

    private function storeVariant(Store $store, Item $item): StoreVariant
    {
        return StoreVariant::factory()->create([
            'store_id' => $store->id,
            'item_id' => $item->id,
            'item_variant_id' => ItemVariant::factory()->create(['item_id' => $item->id])->id,
        ]);
    }

    #[Test]
    public function a_store_admin_opens_their_own_store_page_but_not_another_or_the_store_list(): void
    {
        $item = Item::factory()->create(['status' => 'active']);
        $this->storeVariant($this->own, $item);
        $theirs = $this->storeVariant($this->other, $item);

        $this->actingAs($this->storeAdmin);

        $this->get(route('store.show', $this->own))->assertOk();
        $this->get(route('store.item.variants', ['store' => $this->own, 'item' => $item]))->assertOk();

        $this->get(route('store.show', $this->other))->assertNotFound();
        $this->get(route('store.item.variants', ['store' => $this->other, 'item' => $item]))->assertNotFound();
        $this->get(route('store.index'))->assertForbidden();
        $this->get(route('store.edit', $this->own))->assertForbidden();
        $this->delete(route('store.destroy', $this->own))->assertForbidden();

        // Another store's prices are out of reach too.
        $this->postJson(route('store-variant.customer-price.upsert', $theirs), [
            'customer_id' => $this->customer($this->other, 'Theirs')->id, 'customer_type' => 'business', 'price' => 1,
        ])->assertNotFound();
        $this->assertSame(0, StoreVariantCustomerPrice::query()->count());
    }

    #[Test]
    public function customer_discounts_follow_the_active_store_and_say_when_they_end(): void
    {
        $item = Item::factory()->create(['status' => 'active', 'product_name' => 'Pens']);
        $ownVariant = $this->storeVariant($this->own, $item);
        $otherVariant = $this->storeVariant($this->other, $item);
        $mine = $this->customer($this->own, 'Mine');

        StoreVariantCustomerPrice::query()->create(['store_variant_id' => $ownVariant->id, 'customer_id' => $mine->id,
            'pricing_matrix' => ['price' => 100, 'discount_price' => 80, 'discount_ends_at' => now()->addDays(3)->toDateString()]]);
        StoreVariantCustomerPrice::query()->create(['store_variant_id' => $ownVariant->id, 'customer_id' => $this->customer($this->own, 'Old')->id,
            'pricing_matrix' => ['price' => 100, 'discount_price' => 70, 'discount_ends_at' => now()->subDay()->toDateString()]]);
        StoreVariantCustomerPrice::query()->create(['store_variant_id' => $otherVariant->id, 'customer_id' => $this->customer($this->other, 'Theirs')->id,
            'pricing_matrix' => ['price' => 100, 'discount_price' => 50, 'discount_ends_at' => null]]);

        $this->actingAs($this->storeAdmin);
        $this->get(route('admin.customers.discounts'))->assertOk()->assertInertia(fn ($page) => $page
            ->component('Admin/Customers/Discounts')
            ->has('discounts', 1)
            ->where('discounts.0.customer', 'Mine')
            ->where('discounts.0.discount_price', 80)
            ->where('discounts.0.days_left', 3)
            ->where('counts.expired', 1)
            ->where('counts.all', 2));

        $this->actingAs($this->global);
        $this->get(route('admin.customers.discounts', ['store' => 'all', 'status' => 'active']))
            ->assertInertia(fn ($page) => $page->has('discounts', 2));
    }

    #[Test]
    public function the_store_page_filters_cover_the_whole_store_and_opening_it_selects_the_store(): void
    {
        $stocked = Item::factory()->create(['status' => 'active', 'product_name' => 'Stocked']);
        $empty = Item::factory()->create(['status' => 'active', 'product_name' => 'Empty']);
        $sv = $this->storeVariant($this->own, $stocked);
        $this->storeVariant($this->own, $empty)->update(['active' => false]);

        app(\App\Services\StockService::class)->receive(
            (int) $sv->item_variant_id,
            \App\Models\Inventory\StockLocation::query()->where('store_id', $this->own->id)->where('kind', \App\Models\Inventory\StockLocation::KIND_SHELF)->sole(),
            10,
        );

        $this->actingAs($this->global);

        $this->get(route('store.show', $this->own))->assertOk()->assertInertia(fn ($page) => $page
            ->where('activeStore.id', $this->own->id)
            ->where('summary.items', 2)
            ->where('summary.active', 1)
            ->where('summary.out', 1)
            ->where('summary.in_stock_rate', 50)
            ->where('filter', 'all'));

        $this->get(route('store.show', ['store' => $this->own, 'filter' => 'out']))
            ->assertInertia(fn ($page) => $page->has('inventory.data', 1)->where('inventory.data.0.item_name', 'Empty'));
        $this->get(route('store.show', ['store' => $this->own, 'filter' => 'active']))
            ->assertInertia(fn ($page) => $page->has('inventory.data', 1)->where('inventory.data.0.item_name', 'Stocked'));
        $this->get(route('store.show', ['store' => $this->own, 'filter' => 'low']))
            ->assertInertia(fn ($page) => $page->has('inventory.data', 0)->where('summary.monitored_variants', 0));
    }

    #[Test]
    public function the_how_it_works_page_opens_and_the_dashboard_road_counts_the_active_store(): void
    {
        Cart::query()->create(['store_id' => $this->own->id, 'status' => 'open', 'session_id' => '1']);
        Cart::query()->create(['store_id' => $this->other->id, 'status' => 'open', 'session_id' => '2']);
        Sale::query()->create(['store_id' => $this->own->id, 'total_amount' => 1, 'reference_number' => 'SALE-PAY', 'fulfillment_stage' => Sale::STAGE_AWAITING_PAYMENT]);

        $this->actingAs($this->storeAdmin);

        $this->get(route('admin.flow'))->assertRedirect('/guide');
        $this->get(route('admin.guide', ['chapter' => 'moving', 'step' => 'sh-carry']))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Guide/Index')->where('app', 'admin')->where('chapter', 'moving')->where('step', 'sh-carry'));
        $this->get(route('admin.dashboard'))->assertInertia(fn ($page) => $page
            ->where('pipeline.cart', 1)
            ->where('pipeline.to_pay', 1)
            ->where('pipeline.delivered', 0));
    }

    #[Test]
    public function the_dashboard_has_a_card_for_every_area_scoped_to_the_store(): void
    {
        $this->customer($this->own, 'Mine');
        $this->customer($this->other, 'Theirs');
        Sale::query()->create(['store_id' => $this->own->id, 'total_amount' => 1, 'reference_number' => 'SALE-A', 'fulfillment_stage' => Sale::STAGE_AWAITING_PAYMENT]);

        $area = fn (array $areas, string $key): ?array => collect($areas)->firstWhere('key', $key);

        $this->actingAs($this->storeAdmin);
        $this->get(route('admin.dashboard'))->assertOk()->assertInertia(fn ($page) => $page
            ->where('areas', function ($areas) use ($area) {
                $areas = collect($areas)->map(fn ($a) => (array) $a)->all();
                $keys = collect($areas)->pluck('key')->all();

                return $keys === ['customers', 'carts', 'orders', 'payments', 'balances', 'pick_pack', 'delivery', 'store', 'transfers', 'shipments']
                    && $area($areas, 'customers')['value'] === 1
                    && $area($areas, 'orders')['attention'] === 1;
            }));

        $this->actingAs($this->global);
        $this->get(route('admin.dashboard', ['store' => 'all']))->assertInertia(fn ($page) => $page
            ->where('areas', fn ($areas) => collect($areas)->pluck('key')->intersect(['warehouses', 'fleet', 'catalogue', 'people'])->count() === 4
                && collect($areas)->firstWhere('key', 'customers')['value'] === 2));
    }
}
