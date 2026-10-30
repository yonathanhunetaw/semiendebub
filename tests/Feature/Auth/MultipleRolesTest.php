<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Auth\User;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A user can hold their main role plus "also works as" roles. Each app sees
 * them as the role of that app; everywhere else they are their main role.
 */
class MultipleRolesTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, array $also = [], ?int $storeId = null): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->syncRoles([$role, ...$also]);

        return $user->fresh();
    }

    /** Resolve the key as it would be seen on a request to this host. */
    private function keyOn(User $user, string $subdomain): string
    {
        $host = "{$subdomain}.".config('app.system_domain');
        $this->app->instance('request', \Illuminate\Http\Request::create("http://{$host}/dashboard"));

        return $user->fresh()->roleKey();
    }

    #[Test]
    public function a_user_is_the_role_of_the_app_they_stand_in(): void
    {
        $user = $this->user('seller', ['stock_keeper']);

        $this->assertSame('seller', $this->keyOn($user, 'seller'));
        $this->assertSame('stock_keeper', $this->keyOn($user, 'stockkeeper'));
        $this->assertSame('seller', $this->keyOn($user, 'finance'), 'an app they hold no role for: the main role');
    }

    #[Test]
    public function a_single_role_user_is_unchanged_everywhere(): void
    {
        $this->assertSame('seller', $this->keyOn($this->user('seller'), 'stockkeeper'));
    }

    #[Test]
    public function without_a_request_host_the_main_role_wins(): void
    {
        $user = $this->user('seller', ['stock_keeper']);

        $this->assertSame('seller', $user->roleKey());
    }

    #[Test]
    public function a_store_admin_needs_the_tick_to_open_the_seller_app(): void
    {
        $base = config('app.system_domain');
        $store = Store::factory()->create()->id;
        $plain = $this->user('admin', [], $store);
        $ticked = $this->user('admin', ['seller'], $store);

        $this->actingAs($plain)->get("http://seller.{$base}/dashboard")->assertForbidden();
        $this->actingAs($ticked)->get("http://seller.{$base}/dashboard")->assertOk();
        $this->actingAs($ticked)->get("http://stockkeeper.{$base}/dashboard")->assertForbidden();
    }

    #[Test]
    public function the_user_form_saves_the_ticked_roles_and_edit_shows_them(): void
    {
        $base = config('app.system_domain');
        $admin = $this->user('admin');

        $this->actingAs($admin)->post("http://admin.{$base}/users", [
            'first_name' => 'Sara', 'email' => 'sara@example.test', 'role' => 'seller',
            'also_roles' => ['stock_keeper'], 'password' => 'password1', 'password_confirmation' => 'password1',
        ])->assertRedirect();

        $sara = User::where('email', 'sara@example.test')->firstOrFail();
        $this->assertEqualsCanonicalizing(['seller', 'stock_keeper'], $sara->roles->pluck('name')->all());
        $this->assertSame('seller', $sara->getAttributes()['role']);

        $this->actingAs($admin)->put("http://admin.{$base}/users/{$sara->id}", [
            'first_name' => 'Sara', 'email' => 'sara@example.test', 'role' => 'seller', 'also_roles' => [],
        ])->assertRedirect();
        $this->assertSame(['seller'], $sara->fresh()->roles->pluck('name')->all());
    }

    #[Test]
    public function admin_and_dev_cannot_be_ticked_as_extra_roles(): void
    {
        $base = config('app.system_domain');
        $admin = $this->user('admin');

        $this->actingAs($admin)->post("http://admin.{$base}/users", [
            'first_name' => 'Eve', 'email' => 'eve@example.test', 'role' => 'seller',
            'also_roles' => ['admin'], 'password' => 'password1', 'password_confirmation' => 'password1',
        ])->assertSessionHasErrors('also_roles.0');
    }

    #[Test]
    public function reconcile_keeps_the_extra_roles(): void
    {
        $user = $this->user('seller', ['stock_keeper']);

        $this->artisan('users:reconcile-roles')->assertSuccessful();

        $this->assertEqualsCanonicalizing(['seller', 'stock_keeper'], $user->fresh()->roles->pluck('name')->all());
    }

    #[Test]
    public function a_ticked_global_admin_keeps_every_store_in_the_seller_app(): void
    {
        $base = config('app.system_domain');
        $store = Store::factory()->create();
        $plain = $this->user('admin');
        $ticked = $this->user('admin', ['seller', 'stock_keeper']);
        $customer = \App\Models\Auth\Customer::factory()->create(['store_id' => $store->id, 'created_by' => $plain->id]);

        // A tick adds an app; it never takes a global admin's stores away.
        foreach ([$plain, $ticked] as $admin) {
            $this->assertTrue($admin->isGlobalAdmin());
            $this->actingAs($admin)->get("http://seller.{$base}/customers/{$customer->id}")->assertOk();
            $this->actingAs($admin)->get("http://seller.{$base}/refills?store={$store->id}")
                ->assertOk()
                ->assertInertia(fn ($page) => $page->where('storeId', $store->id));
        }

        // Standing in the seller app the ticked admin is a "seller", yet still reaches every store and may
        // confirm cash at any of them, as a plain global admin there may.
        $this->assertSame('seller', $this->keyOn($ticked, 'seller'));
        $this->assertNull(\App\Services\Admin\ActiveStore::accessibleIdsFor($ticked));
        $this->assertTrue(\App\Services\Finance\PaymentService::managesStore($ticked, $store->id));

        $this->assertFalse($this->user('admin', ['seller'], $store->id)->isGlobalAdmin(), 'a store admin is not global');
        $this->assertFalse($this->user('seller')->isGlobalAdmin());
    }
}
