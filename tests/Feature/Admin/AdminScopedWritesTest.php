<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Services\ShipmentWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Writes that must respect whose they are: the fleet (edit / remove a car),
 * a store admin assigning location managers, and carts opened from the seller
 * app by an admin or with another store's customer.
 */
class AdminScopedWritesTest extends TestCase
{
    use RefreshDatabase;

    private Store $own;

    private Store $other;

    protected function setUp(): void
    {
        parent::setUp();

        $this->own = Store::factory()->create(['name' => 'Own', 'type' => Store::TYPE_RETAIL]);
        $this->other = Store::factory()->create(['name' => 'Other', 'type' => Store::TYPE_RETAIL]);
    }

    private function user(string $role, ?Store $store): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $store?->id]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function customerOf(Store $store): Customer
    {
        static $n = 0;
        $n++;

        return Customer::query()->create([
            'first_name' => "C{$n}", 'email' => "c{$n}@example.com", 'phone_number' => '09110000'.str_pad((string) $n, 2, '0', STR_PAD_LEFT),
            'store_id' => $store->id, 'created_by' => User::factory()->create()->id,
        ]);
    }

    // ---- Fleet ---------------------------------------------------------------

    #[Test]
    public function a_global_admin_edits_and_removes_a_car_but_not_one_on_an_open_run(): void
    {
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->user('admin', null));
        $car = Vehicle::factory()->create(['name' => 'Isuzu', 'plate' => 'AA-1', 'max_cbm' => 10]);
        $busy = Vehicle::factory()->create(['name' => 'Hino', 'plate' => 'AA-2', 'max_cbm' => 20]);
        Vehicle::factory()->create(['plate' => 'AA-3']);

        $this->put(route('admin.inventory.fleet.update', $car), ['name' => 'Isuzu FSR', 'plate' => 'AA-1', 'max_cbm' => 24, 'status' => Vehicle::STATUS_ACTIVE])
            ->assertSessionHas('success', 'Isuzu FSR (AA-1) updated.');
        $this->assertSame(24.0, (float) $car->fresh()->max_cbm);

        $this->put(route('admin.inventory.fleet.update', $car), ['name' => 'Isuzu', 'plate' => 'AA-3', 'max_cbm' => 24, 'status' => Vehicle::STATUS_ACTIVE])
            ->assertSessionHasErrors('plate');

        $hub = Store::factory()->create(['type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $depot = Store::factory()->create(['type' => Store::TYPE_REMOTE_WAREHOUSE]);
        app(ShipmentWorkflowService::class)->create($hub->id, $depot->id, ['vehicle_id' => $busy->id]);

        $this->delete(route('admin.inventory.fleet.destroy', $busy))->assertSessionHas('error', 'AA-2 is on an open run. Retire it instead.');
        $this->assertModelExists($busy);

        $this->delete(route('admin.inventory.fleet.destroy', $car))->assertSessionHas('success', 'AA-1 removed from the fleet.');
        $this->assertModelMissing($car);
    }

    #[Test]
    public function a_store_admin_cannot_touch_the_fleet(): void
    {
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->user('admin', $this->own));
        $car = Vehicle::factory()->create(['plate' => 'AA-9']);

        $this->put(route('admin.inventory.fleet.update', $car), ['name' => 'x', 'plate' => 'AA-9', 'max_cbm' => 1, 'status' => Vehicle::STATUS_ACTIVE])->assertForbidden();
        $this->delete(route('admin.inventory.fleet.destroy', $car))->assertForbidden();
        $this->assertModelExists($car);
    }

    // ---- Location managers ---------------------------------------------------

    #[Test]
    public function a_store_admin_assigns_only_their_own_stores_people(): void
    {
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->user('admin', $this->own));
        $shelf = StockLocation::query()->where('store_id', $this->own->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $outsider = $this->user('seller', $this->other);
        $insider = $this->user('seller', $this->own);

        $this->post(route('admin.inventory.stock-locations.managers', $shelf), ['manager_ids' => [$outsider->id]])->assertForbidden();
        $this->assertFalse($shelf->fresh()->isManagedBy($outsider));

        $this->post(route('admin.inventory.stock-locations.managers', $shelf), ['manager_ids' => [$insider->id]])->assertSessionHas('success');
        $this->assertTrue($shelf->fresh()->isManagedBy($insider));

        $otherShelf = StockLocation::query()->where('store_id', $this->other->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $this->post(route('admin.inventory.stock-locations.managers', $otherShelf), ['manager_ids' => [$insider->id]])->assertNotFound();
    }

    // ---- Carts from the seller app -------------------------------------------

    #[Test]
    public function a_seller_cannot_open_or_move_a_cart_to_another_stores_customer(): void
    {
        $seller = $this->user('seller', $this->own);
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);
        $this->actingAs($seller);

        $this->post(route('seller.carts.store'), ['customer_id' => $this->customerOf($this->other)->id])
            ->assertSessionHasErrors(['customer_id' => "That customer is not one of this store's customers."]);
        $this->assertSame(0, Cart::query()->count());

        $this->post(route('seller.carts.store'), ['customer_id' => $this->customerOf($this->own)->id])->assertRedirect();
        $cart = Cart::query()->sole();
        $this->assertSame([$this->own->id, $seller->id], [(int) $cart->store_id, (int) $cart->seller_id]);

        $this->put(route('seller.carts.update', $cart), ['customer_id' => $this->customerOf($this->other)->id, 'status' => 'open'])
            ->assertSessionHasErrors('customer_id');
    }

    #[Test]
    public function a_global_admin_opening_a_cart_from_the_seller_app_must_name_its_store(): void
    {
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);
        $this->actingAs($this->user('admin', null));

        $this->post(route('seller.carts.store'), [])->assertSessionHasErrors('store_id');
        $this->assertSame(0, Cart::query()->count(), 'no cart without a store');

        $this->post(route('seller.carts.store'), ['store_id' => $this->own->id])->assertRedirect(route('admin.carts.index'));
        $cart = Cart::query()->sole();
        $this->assertSame($this->own->id, (int) $cart->store_id);
    }

    #[Test]
    public function a_store_admins_cart_from_the_seller_app_is_their_stores(): void
    {
        $admin = $this->user('admin', $this->own);
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);
        $this->actingAs($admin);

        $this->post(route('seller.carts.store'), [])->assertRedirect();

        $cart = Cart::query()->sole();
        $this->assertSame([$this->own->id, $admin->id], [(int) $cart->store_id, (int) $cart->seller_id]);
    }
}
