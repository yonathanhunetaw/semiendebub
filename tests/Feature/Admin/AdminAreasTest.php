<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Store\Store;
use App\Services\Admin\AdminAreas;
use App\Services\Finance\ExpenseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A store admin is kept to their store; a global admin may tick parts of the
 * global zone on for them (AdminAreas). Users, sessions and the system status
 * are never on the list.
 */
class AdminAreasTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private User $global;

    private User $storeAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create(['name' => 'Own Store', 'type' => Store::TYPE_RETAIL]);
        $this->global = $this->user('admin', null);
        $this->storeAdmin = $this->user('admin', $this->store->id);

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user->refresh();
    }

    #[Test]
    public function a_store_admin_opens_only_the_areas_ticked_on_for_them(): void
    {
        $this->actingAs($this->storeAdmin)->get(route('admin.items.index'))->assertForbidden();
        $this->actingAs($this->storeAdmin)->get(route('admin.inventory.fleet.index'))->assertForbidden();

        app(AdminAreas::class)->sync($this->storeAdmin, ['items']);

        $this->actingAs($this->storeAdmin->refresh())->get(route('admin.items.index'))->assertOk();
        $this->actingAs($this->storeAdmin)->get(route('admin.inventory.fleet.index'))->assertForbidden();
        $this->actingAs($this->storeAdmin)->get(route('admin.items.index'))
            ->assertInertia(fn ($page) => $page->where('adminAreas', ['items'])->where('isGlobalAdmin', false));
    }

    #[Test]
    public function users_sessions_and_the_system_stay_with_global_admins_whatever_is_ticked(): void
    {
        app(AdminAreas::class)->sync($this->storeAdmin, [...array_keys(AdminAreas::AREAS), 'users', 'sessions', 'system']);
        $this->storeAdmin->refresh();

        $this->assertSame(array_keys(AdminAreas::AREAS), app(AdminAreas::class)->grantedTo($this->storeAdmin));
        $this->actingAs($this->storeAdmin)->get(route('admin.users.index'))->assertForbidden();
        $this->actingAs($this->storeAdmin)->get(route('admin.system.index'))->assertForbidden();
        $this->actingAs($this->global)->get(route('admin.users.index'))->assertOk();
    }

    #[Test]
    public function a_global_admin_sets_the_ticks_on_the_user_form_and_a_tick_lets_them_act_too(): void
    {
        $this->actingAs($this->global)->put(route('admin.users.update', $this->storeAdmin), [
            'first_name' => 'Store', 'email' => $this->storeAdmin->email, 'role' => 'admin',
            'store_id' => $this->store->id, 'areas' => ['expenses', 'fleet'],
        ])->assertRedirect(route('admin.users.index'));

        $admin = $this->storeAdmin->refresh();
        $this->assertEqualsCanonicalizing(['expenses', 'fleet'], app(AdminAreas::class)->grantedTo($admin));
        $this->assertTrue(ExpenseService::mayConfirm($admin));

        // The edit form shows them back; a global admin has none to tick.
        $this->actingAs($this->global)->get(route('admin.users.edit', $admin))
            ->assertInertia(fn ($page) => $page->where('user.areas', fn ($areas) => collect($areas)->sort()->values()->all() === ['expenses', 'fleet'])->has('admin_areas', count(AdminAreas::AREAS)));

        // Made a global admin (no store), the ticks go: they have every area anyway.
        $this->actingAs($this->global)->put(route('admin.users.update', $admin), [
            'first_name' => 'Store', 'email' => $admin->email, 'role' => 'admin', 'store_id' => null, 'areas' => ['expenses'],
        ]);
        $this->assertSame(0, $admin->refresh()->permissions()->count());
        $this->assertSame(array_keys(AdminAreas::AREAS), app(AdminAreas::class)->grantedTo($admin));
    }

    #[Test]
    public function without_a_tick_a_store_admin_cannot_confirm_expenses(): void
    {
        $this->assertFalse(ExpenseService::mayConfirm($this->storeAdmin));
        $this->assertTrue(ExpenseService::mayConfirm($this->global));
    }
}
