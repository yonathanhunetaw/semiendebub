<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCapacity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Admin → Carts (list, raise, show, delete) and Inventory → Capacity bands. */
class AdminCartCapacityTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');
        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->admin);
    }

    private function seller(): User
    {
        $seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $seller->assignRole('seller');

        return $seller;
    }

    // ---- Carts -------------------------------------------------------------

    #[Test]
    public function an_admin_raises_a_cart_for_a_store_seller_and_customer(): void
    {
        $seller = $this->seller();
        $customer = Customer::query()->create(['first_name' => 'Abebe', 'email' => 'a@example.com', 'phone_number' => '0911000009', 'created_by' => $this->admin->id]);

        $this->post(route('admin.carts.store'), [
            'store_id' => $this->store->id, 'seller_id' => $seller->id, 'customer_id' => $customer->id,
        ])->assertRedirect(route('admin.carts.index'));

        $cart = Cart::query()->sole();
        $this->assertSame('open', $cart->status);
        $this->assertSame($this->store->id, (int) $cart->store_id);
        $this->assertSame($seller->id, (int) $cart->seller_id);
        $this->assertSame($this->admin->id, (int) $cart->user_id);
    }

    #[Test]
    public function a_cart_needs_a_real_store_and_the_seller_must_be_a_seller(): void
    {
        $this->post(route('admin.carts.store'), [])->assertSessionHasErrors('store_id');
        $this->post(route('admin.carts.store'), ['store_id' => 999999])->assertSessionHasErrors('store_id');
        $this->post(route('admin.carts.store'), ['store_id' => $this->store->id, 'seller_id' => $this->admin->id])
            ->assertSessionHasErrors('seller_id');

        $this->assertSame(0, Cart::query()->count());
    }

    #[Test]
    public function the_cart_list_and_create_form_open(): void
    {
        $this->post(route('admin.carts.store'), ['store_id' => $this->store->id]);

        $this->get(route('admin.carts.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Carts/Index')->where('carts.data', fn ($rows) => count($rows) === 1));
        $this->get(route('admin.carts.create'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Carts/Create')->has('stores'));
    }

    #[Test]
    public function a_cart_page_shows_its_lines_and_total(): void
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $cart = Cart::query()->create(['store_id' => $this->store->id, 'user_id' => $this->admin->id, 'status' => 'open', 'session_id' => '123456']);
        $cart->variants()->attach($variant->id, ['store_id' => $this->store->id, 'quantity' => 3, 'price' => 10]);

        $this->get(route('admin.carts.show', $cart))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Carts/Show')
                ->where('cart.total', fn ($total) => (float) $total === 30.0)
                ->where('cart.items', fn ($lines) => count($lines) === 1 && $lines[0]['quantity'] === 3));
    }

    #[Test]
    public function an_admin_deletes_a_cart_and_its_lines(): void
    {
        $variant = ItemVariant::factory()->create();
        $cart = Cart::query()->create(['store_id' => $this->store->id, 'user_id' => $this->admin->id, 'status' => 'open', 'session_id' => '123456']);
        $cart->variants()->attach($variant->id, ['store_id' => $this->store->id, 'quantity' => 1, 'price' => 5]);

        $this->delete(route('admin.carts.destroy', $cart->id))->assertSessionHas('message');

        $this->assertNull(Cart::query()->find($cart->id));
        $this->assertSame(0, DB::table($cart->variants()->getTable())->where($cart->variants()->getForeignPivotKeyName(), $cart->id)->count());
    }

    #[Test]
    public function deleting_a_missing_cart_reports_an_error_instead_of_failing(): void
    {
        $this->delete(route('admin.carts.destroy', 999999))->assertSessionHas('error');
    }

    // ---- Capacity ----------------------------------------------------------

    private function storeVariant(): StoreVariant
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        return StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id]);
    }

    private function floor(): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
    }

    #[Test]
    public function the_capacity_list_and_edit_pages_open(): void
    {
        $storeVariant = $this->storeVariant();

        $this->get(route('admin.inventory.capacity.index', ['store_id' => $this->store->id]))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Inventory/Capacity/index')
                ->where('variants', fn ($rows) => count($rows) === 1));
        $this->get(route('admin.inventory.capacity.index', ['store_id' => $this->store->id, 'search' => 'zzz-no-match']))->assertOk()
            ->assertInertia(fn ($page) => $page->where('variants', fn ($rows) => count($rows) === 0));
        $this->get(route('admin.inventory.capacity.edit', $storeVariant))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Inventory/Capacity/Edit')->where('can_edit', true)->has('bands'));
    }

    #[Test]
    public function an_admin_sets_a_band_on_a_location(): void
    {
        $storeVariant = $this->storeVariant();
        $floor = $this->floor();

        $this->patch(route('admin.inventory.capacity.update', $storeVariant), ['bands' => [[
            'location_type' => StockLocation::class, 'location_id' => $floor->id, 'min_capacity' => 5, 'max_capacity' => 20,
        ]]])->assertSessionHasNoErrors()->assertSessionHas('success');

        $band = StoreVariantCapacity::query()->where('store_variant_id', $storeVariant->id)->sole();
        $this->assertSame(5, (int) $band->min_capacity);
        $this->assertSame(20, (int) $band->max_capacity);
    }

    #[Test]
    public function a_band_needs_a_maximum_at_least_the_minimum(): void
    {
        $storeVariant = $this->storeVariant();

        $this->patch(route('admin.inventory.capacity.update', $storeVariant), ['bands' => [[
            'location_type' => StockLocation::class, 'location_id' => $this->floor()->id, 'min_capacity' => 20, 'max_capacity' => 5,
        ]]])->assertSessionHasErrors('bands.0.max_capacity');

        $this->patch(route('admin.inventory.capacity.update', $storeVariant), [])->assertSessionHasErrors('bands');
        $this->assertSame(0, StoreVariantCapacity::query()->count());
    }

    #[Test]
    public function a_seller_cannot_change_capacity(): void
    {
        $storeVariant = $this->storeVariant();
        $this->actingAs($this->seller());

        $this->patch(route('admin.inventory.capacity.update', $storeVariant), ['bands' => [[
            'location_type' => StockLocation::class, 'location_id' => $this->floor()->id, 'min_capacity' => 5, 'max_capacity' => 20,
        ]]])->assertStatus(403);

        $this->assertSame(0, StoreVariantCapacity::query()->count());
    }
}
