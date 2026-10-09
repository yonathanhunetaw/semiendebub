<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Inventory\FacilityManager;
use App\Models\Inventory\Warehouse;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Admin → Warehouses (create, edit, delete, managers), the location aliases and Store update. */
class AdminWarehouseStoreTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'store_manager', 'stock_keeper'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->admin);
    }

    private function user(string $role): User
    {
        $user = User::factory()->create(['role' => $role]);
        $user->assignRole($role);

        return $user;
    }

    #[Test]
    public function the_create_and_edit_forms_open(): void
    {
        $warehouse = Warehouse::query()->create(['name' => 'Kality Depot', 'status' => 'active']);

        $this->get(route('admin.inventory.warehouse.create'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Inventory/Warehouse/Create')->has('stores'));
        $this->get(route('admin.inventory.warehouse.edit', $warehouse))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Inventory/Warehouse/Edit')->where('warehouse.name', 'Kality Depot'));
    }

    #[Test]
    public function an_admin_creates_a_warehouse(): void
    {
        $store = Store::factory()->create();

        $this->post(route('admin.inventory.warehouse.store'), [
            'name' => 'Kality Depot', 'code' => 'KAL-1', 'address' => 'Kality', 'store_id' => $store->id, 'status' => 'active',
        ])->assertRedirect(route('admin.inventory.warehouse.index'))->assertSessionHas('success');

        $this->assertDatabaseHas('warehouses', ['name' => 'Kality Depot', 'code' => 'KAL-1', 'store_id' => $store->id]);
    }

    #[Test]
    public function a_warehouse_can_serve_several_stores(): void
    {
        [$a, $b, $c] = Store::factory()->count(3)->create()->all();

        $this->post(route('admin.inventory.warehouse.store'), [
            'name' => 'Shared Depot', 'status' => 'active', 'store_ids' => [$a->id, $b->id],
        ])->assertSessionHasNoErrors();

        $warehouse = Warehouse::query()->where('name', 'Shared Depot')->sole();
        $this->assertEqualsCanonicalizing([$a->id, $b->id], $warehouse->stores()->pluck('stores.id')->all());
        $this->assertSame($a->id, (int) $warehouse->store_id, 'The legacy column keeps the first store.');
        $this->assertSame([$warehouse->id], $b->warehouses()->pluck('warehouses.id')->all());

        $this->put(route('admin.inventory.warehouse.update', $warehouse), [
            'name' => 'Shared Depot', 'status' => 'active', 'store_ids' => [$c->id],
        ])->assertSessionHasNoErrors();

        $this->assertSame([$c->id], $warehouse->stores()->pluck('stores.id')->all());

        $this->get(route('admin.inventory.warehouse.index'))->assertInertia(fn ($page) => $page
            ->where('warehouses.0.store_names', [$c->name]));
    }

    #[Test]
    public function a_warehouse_needs_a_name_a_valid_status_and_a_unique_code(): void
    {
        Warehouse::query()->create(['name' => 'First', 'code' => 'DUP', 'status' => 'active']);

        $this->post(route('admin.inventory.warehouse.store'), [])->assertSessionHasErrors(['name', 'status']);
        $this->post(route('admin.inventory.warehouse.store'), ['name' => 'X', 'status' => 'archived'])->assertSessionHasErrors('status');
        $this->post(route('admin.inventory.warehouse.store'), ['name' => 'Second', 'code' => 'DUP', 'status' => 'active'])->assertSessionHasErrors('code');
        $this->post(route('admin.inventory.warehouse.store'), ['name' => 'X', 'status' => 'active', 'store_id' => 999999])->assertSessionHasErrors('store_id');

        $this->assertSame(1, Warehouse::query()->count());
    }

    #[Test]
    public function an_admin_updates_a_warehouse_and_may_keep_its_own_code(): void
    {
        $warehouse = Warehouse::query()->create(['name' => 'Old', 'code' => 'KEEP', 'status' => 'active']);
        Warehouse::query()->create(['name' => 'Other', 'code' => 'TAKEN', 'status' => 'active']);

        $this->put(route('admin.inventory.warehouse.update', $warehouse), ['name' => 'New', 'code' => 'KEEP', 'status' => 'inactive'])
            ->assertSessionHasNoErrors()->assertSessionHas('success');

        $warehouse->refresh();
        $this->assertSame('New', $warehouse->name);
        $this->assertSame('inactive', $warehouse->status);

        $this->put(route('admin.inventory.warehouse.update', $warehouse), ['name' => 'New', 'code' => 'TAKEN', 'status' => 'active'])
            ->assertSessionHasErrors('code');
    }

    #[Test]
    public function an_admin_deletes_a_warehouse(): void
    {
        $warehouse = Warehouse::query()->create(['name' => 'Gone', 'status' => 'active']);

        $this->delete(route('admin.inventory.warehouse.destroy', $warehouse))->assertSessionHas('success');

        $this->assertNull(Warehouse::query()->find($warehouse->id));
    }

    #[Test]
    public function a_warehouse_page_sends_the_viewer_to_the_locations_screen(): void
    {
        $warehouse = Warehouse::query()->create(['name' => 'Kality', 'status' => 'active']);

        $this->get(route('admin.inventory.warehouse.show', $warehouse))->assertRedirect(route('admin.inventory.stock-locations.index'));
    }

    #[Test]
    public function an_admin_appoints_and_clears_warehouse_managers(): void
    {
        $warehouse = Warehouse::query()->create(['name' => 'Kality', 'status' => 'active']);
        $one = $this->user('store_manager');
        $two = $this->user('stock_keeper');

        $this->post(route('admin.inventory.warehouse.managers.assign', $warehouse), ['manager_ids' => [$one->id, $two->id]])
            ->assertSessionHasNoErrors()->assertSessionHas('success');
        $this->assertEqualsCanonicalizing([$one->id, $two->id], FacilityManager::query()->where('facility_id', $warehouse->id)->pluck('user_id')->map(fn ($id) => (int) $id)->all());

        $this->post(route('admin.inventory.warehouse.managers.assign', $warehouse), ['manager_ids' => []])->assertSessionHasNoErrors();
        $this->assertSame(0, FacilityManager::query()->where('facility_id', $warehouse->id)->count());
    }

    #[Test]
    public function manager_ids_must_be_real_distinct_users(): void
    {
        $warehouse = Warehouse::query()->create(['name' => 'Kality', 'status' => 'active']);
        $one = $this->user('store_manager');

        $this->post(route('admin.inventory.warehouse.managers.assign', $warehouse), ['manager_ids' => [999999]])->assertSessionHasErrors('manager_ids.0');
        $this->post(route('admin.inventory.warehouse.managers.assign', $warehouse), ['manager_ids' => [$one->id, $one->id]])->assertSessionHasErrors('manager_ids.1');
        $this->post(route('admin.inventory.warehouse.managers.assign', $warehouse), [])->assertSessionHasErrors('manager_ids');
    }

    #[Test]
    public function only_an_admin_may_appoint_warehouse_managers(): void
    {
        $warehouse = Warehouse::query()->create(['name' => 'Kality', 'status' => 'active']);
        $manager = $this->user('store_manager');
        $this->actingAs($manager);

        $this->post(route('admin.inventory.warehouse.managers.assign', $warehouse), ['manager_ids' => [$manager->id]])->assertForbidden();
    }

    #[Test]
    public function the_location_aliases_open_the_form_and_create_a_warehouse(): void
    {
        $this->get(route('admin.inventory.locations.create'))->assertOk();

        $this->post(route('admin.inventory.locations.store'), ['name' => 'Via Alias', 'status' => 'active'])
            ->assertRedirect(route('admin.inventory.warehouse.index'));

        $this->assertDatabaseHas('warehouses', ['name' => 'Via Alias']);
    }

    #[Test]
    public function an_admin_updates_a_store(): void
    {
        $store = Store::factory()->create(['name' => 'Old Name']);

        $this->put(route('admin.stores.update', $store), ['name' => 'New Name', 'location' => 'Bole', 'status' => 'active'])
            ->assertSessionHasNoErrors();

        $this->assertSame('New Name', $store->fresh()->name);
    }

    #[Test]
    public function a_store_needs_a_unique_name_and_a_valid_status(): void
    {
        Store::factory()->create(['name' => 'Taken']);
        $store = Store::factory()->create(['name' => 'Mine']);

        $this->put(route('admin.stores.update', $store), ['name' => 'Taken'])->assertSessionHasErrors('name');
        $this->put(route('admin.stores.update', $store), ['name' => 'Mine', 'status' => 'archived'])->assertSessionHasErrors('status');
        $this->put(route('admin.stores.update', $store), [])->assertSessionHasErrors('name');
    }
}
