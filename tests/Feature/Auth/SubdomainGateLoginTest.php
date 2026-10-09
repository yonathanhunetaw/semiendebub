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
}
