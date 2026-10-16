<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Auth\User;
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
}
