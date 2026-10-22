<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Auth\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * With EnsureCorrectSubdomainRole switched back on, every role must still sign
 * in and land on its own dashboard, and nobody else's app may open for them.
 */
class SubdomainGateLoginTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string, string}> subdomain => [subdomain, role] */
    public static function roles(): array
    {
        return [
            'admin' => ['admin', 'admin'],
            'seller' => ['seller', 'seller'],
            'stockkeeper' => ['stockkeeper', 'stock_keeper'],
            'delivery' => ['delivery', 'delivery'],
            'vendor' => ['vendor', 'vendor'],
            'finance' => ['finance', 'finance'],
            'procurement' => ['procurement', 'procurement'],
            'marketing' => ['marketing', 'marketing'],
            'dev' => ['dev', 'dev'],
            'shared' => ['shared', 'shared'],
        ];
    }

    #[Test]
    #[DataProvider('roles')]
    public function each_role_signs_in_and_reaches_its_own_dashboard(string $subdomain, string $role): void
    {
        $base = config('app.system_domain');
        $user = User::factory()->create(['role' => $role]);
        $user->assignRole($role);

        $this->post("http://{$subdomain}.{$base}/login", ['email' => $user->email, 'password' => 'password'])
            ->assertRedirect("http://{$subdomain}.{$base}/dashboard");

        $this->assertAuthenticatedAs($user);
        $this->get("http://{$subdomain}.{$base}/dashboard")->assertOk();
    }

    #[Test]
    public function signing_in_on_the_wrong_subdomain_sends_you_home(): void
    {
        $base = config('app.system_domain');
        $seller = User::factory()->create(['role' => 'seller']);
        $seller->assignRole('seller');

        $this->post("http://admin.{$base}/login", ['email' => $seller->email, 'password' => 'password'])
            ->assertRedirect("http://seller.{$base}/dashboard");
    }

    #[Test]
    public function a_role_cannot_open_another_roles_app_but_an_admin_can_open_any(): void
    {
        $base = config('app.system_domain');
        $seller = User::factory()->create(['role' => 'seller']);
        $seller->assignRole('seller');

        $this->actingAs($seller)->get("http://stockkeeper.{$base}/dashboard")->assertForbidden();
        $this->actingAs($seller)->get("http://finance.{$base}/dashboard")->assertForbidden();

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');

        $this->actingAs($admin)->get("http://finance.{$base}/dashboard")->assertOk();
    }

    #[Test]
    public function a_store_manager_works_in_the_seller_app(): void
    {
        $base = config('app.system_domain');
        $manager = User::factory()->create(['role' => 'store_manager']);
        $manager->assignRole('store_manager');

        $this->actingAs($manager)->get("http://seller.{$base}/dashboard")->assertOk();
        $this->actingAs($manager)->get("http://stockkeeper.{$base}/dashboard")->assertForbidden();
    }

    #[Test]
    public function a_signed_in_user_opening_login_on_their_own_app_goes_to_the_dashboard(): void
    {
        $base = config('app.system_domain');
        $seller = User::factory()->create(['role' => 'seller']);
        $seller->assignRole('seller');

        $this->actingAs($seller)->get("http://seller.{$base}/login")
            ->assertRedirect('/dashboard');
    }

    #[Test]
    public function a_signed_in_store_manager_opening_login_in_the_seller_app_goes_to_the_dashboard(): void
    {
        $base = config('app.system_domain');
        $manager = User::factory()->create(['role' => 'store_manager']);
        $manager->assignRole('store_manager');

        $this->actingAs($manager)->get("http://seller.{$base}/login")
            ->assertRedirect('/dashboard');
    }

    #[Test]
    public function a_signed_in_user_opening_login_on_the_root_domain_is_sent_home(): void
    {
        $base = config('app.system_domain');
        $manager = User::factory()->create(['role' => 'store_manager']);
        $manager->assignRole('store_manager');

        $this->actingAs($manager)->get("http://{$base}/login")->assertRedirect('/');
        $this->actingAs($manager)->get("http://{$base}/register")->assertRedirect('/');
    }

    #[Test]
    public function a_signed_in_user_can_still_open_the_login_form_of_another_roles_app(): void
    {
        $base = config('app.system_domain');
        $seller = User::factory()->create(['role' => 'seller']);
        $seller->assignRole('seller');

        $this->actingAs($seller)->get("http://finance.{$base}/login")->assertOk();
    }

    #[Test]
    public function with_one_shared_session_as_in_production_another_apps_login_sends_you_to_your_own(): void
    {
        // Production shares one session cookie across the subdomains (separated_session_hosts is
        // only on for local and testing), so a signed-in user is sent to their own app instead.
        config(['subdomains.separated_session_hosts' => false]);
        $base = config('app.system_domain');
        $seller = User::factory()->create(['role' => 'seller']);
        $seller->assignRole('seller');

        $this->actingAs($seller)->get("http://finance.{$base}/login")
            ->assertRedirect("http://seller.{$base}/dashboard");
        $this->actingAs($seller)->get("https://finance.{$base}:8443/login")
            ->assertRedirect("https://seller.{$base}:8443/dashboard");

        // Their own app's login still goes straight to its dashboard.
        $this->actingAs($seller)->get("http://seller.{$base}/login")->assertRedirect('/dashboard');

        // A role with no app of its own (a store manager works in the seller app) is not bounced around.
        $manager = User::factory()->create(['role' => 'store_manager']);
        $manager->assignRole('store_manager');
        $this->actingAs($manager)->get("http://finance.{$base}/login")->assertOk();
    }
}
