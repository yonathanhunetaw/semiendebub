<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Auth\User;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * EnsureCorrectSubdomainRole when sessions are shared across hosts: a user in
 * the wrong app is sent to their own app's dashboard rather than refused.
 */
class SubdomainRoleGateTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        $user = User::factory()->create(['role' => $role, 'email_verified_at' => now()]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function host(string $app): string
    {
        return 'http://'.$app.'.'.config('app.system_domain');
    }

    #[Test]
    public function with_shared_sessions_a_seller_on_the_delivery_app_is_sent_to_their_own_dashboard(): void
    {
        config(['subdomains.separated_session_hosts' => false]);
        $sellerHost = array_search('seller', config('subdomains.host_role_map'), true);
        $this->assertIsString($sellerHost);

        $this->actingAs($this->user('seller'))
            ->get($this->host('delivery').'/dashboard')
            ->assertRedirect('http://'.$sellerHost.'/dashboard');
    }

    #[Test]
    public function with_shared_sessions_a_role_with_no_app_of_its_own_is_refused(): void
    {
        config(['subdomains.separated_session_hosts' => false]);

        $this->actingAs($this->user('user'))
            ->get($this->host('delivery').'/dashboard')
            ->assertForbidden();
    }

    #[Test]
    public function with_separate_sessions_the_wrong_app_is_refused_outright(): void
    {
        config(['subdomains.separated_session_hosts' => true]);

        $this->actingAs($this->user('seller'))
            ->get($this->host('delivery').'/dashboard')
            ->assertForbidden();
    }

    #[Test]
    public function an_admin_enters_any_app_and_the_right_role_enters_its_own(): void
    {
        $this->actingAs($this->user('admin'))->get($this->host('delivery').'/dashboard')->assertOk();
        $this->actingAs($this->user('delivery'))->get($this->host('delivery').'/dashboard')->assertOk();
    }

    /**
     * A store admin is an admin locked to one store. The apps that are not
     * scoped by store (finance, procurement, dev, marketing, vendor, delivery,
     * shared) would show them every store's data, so they stay out.
     */
    #[Test]
    public function a_store_admin_is_refused_on_the_apps_that_are_not_store_scoped(): void
    {
        config(['subdomains.separated_session_hosts' => true]);
        $storeAdmin = $this->storeAdmin();

        foreach (['delivery', 'finance', 'procurement', 'dev', 'marketing', 'vendor', 'shared'] as $app) {
            $this->actingAs($storeAdmin)
                ->get($this->host($app).'/dashboard')
                ->assertForbidden();
        }
    }

    #[Test]
    public function with_shared_sessions_a_store_admin_on_a_global_app_is_sent_to_the_admin_app(): void
    {
        config(['subdomains.separated_session_hosts' => false]);
        $adminHost = array_search('admin', config('subdomains.host_role_map'), true);
        $this->assertIsString($adminHost);

        $this->actingAs($this->storeAdmin())
            ->get($this->host('finance').'/dashboard')
            ->assertRedirect('http://'.$adminHost.'/dashboard');
    }

    #[Test]
    public function a_store_admin_still_enters_the_store_scoped_apps(): void
    {
        config(['subdomains.separated_session_hosts' => true]);
        $storeAdmin = $this->storeAdmin();

        foreach (['seller', 'stockkeeper', 'stock'] as $app) {
            $status = $this->actingAs($storeAdmin)->get($this->host($app).'/dashboard')->status();
            $this->assertNotSame(403, $status, "A store admin was refused on {$app}.");
        }
    }

    #[Test]
    public function a_global_admin_enters_the_apps_a_store_admin_may_not(): void
    {
        config(['subdomains.separated_session_hosts' => true]);
        $globalAdmin = $this->user('admin');
        $this->assertNull($globalAdmin->store_id);

        foreach (['finance', 'procurement', 'vendor'] as $app) {
            $status = $this->actingAs($globalAdmin)->get($this->host($app).'/dashboard')->status();
            $this->assertNotSame(403, $status, "A global admin was refused on {$app}.");
        }
    }

    private function storeAdmin(): User
    {
        $admin = $this->user('admin');
        $admin->forceFill(['store_id' => Store::factory()->create()->id])->save();

        return $admin->refresh();
    }
}
