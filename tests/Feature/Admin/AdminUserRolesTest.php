<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Admin → Users: every role can be given, with a store, and a role change is
 * an access change (the assignment the subdomain gates read follows it).
 */
class AdminUserRolesTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'stock_keeper', 'delivery', 'finance'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        $this->store = Store::factory()->create();

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($admin);
    }

    #[Test]
    public function an_admin_creates_a_courier_who_can_get_into_the_delivery_app(): void
    {
        $this->post(route('admin.users.store'), [
            'first_name' => 'Chala', 'last_name' => 'M', 'email' => 'chala@example.com',
            'role' => 'delivery', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass',
        ])->assertSessionHasNoErrors();

        $courier = User::query()->where('email', 'chala@example.com')->sole();
        $this->assertSame('delivery', $courier->roleKey());
        $this->assertTrue($courier->hasRole('delivery'));
    }

    #[Test]
    public function changing_a_role_changes_access_and_the_store_is_kept(): void
    {
        $user = User::factory()->create(['role' => 'seller']);
        $user->assignRole('seller');

        $this->get(route('admin.users.edit', $user))->assertOk()
            ->assertInertia(fn ($page) => $page->where('user.role', 'seller')->where('roles', fn ($roles) => collect($roles)->contains('delivery')));

        $this->put(route('admin.users.update', $user), [
            'first_name' => $user->first_name, 'email' => $user->email,
            'role' => 'stock_keeper', 'store_id' => $this->store->id,
        ])->assertSessionHasNoErrors();

        $user->refresh();
        $this->assertSame('stock_keeper', $user->roleKey());
        $this->assertFalse($user->hasRole('seller'));
        $this->assertSame($this->store->id, (int) $user->store_id);

        $this->get(route('admin.users.show', $user))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Users/Show')->where('user.id', $user->id)->where('user.store.id', $this->store->id));
    }
}
