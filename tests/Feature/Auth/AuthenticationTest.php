<?php

namespace Tests\Feature\Auth;

use App\Models\Auth\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_screen_can_be_rendered(): void
    {
        $baseDomain = config('app.system_domain', 'duka.local');

        $response = $this->get("http://delivery.{$baseDomain}/login");

        $response->assertStatus(200);
    }

    public function test_users_can_authenticate_using_the_login_screen(): void
    {
        $baseDomain = config('app.system_domain', 'duka.local');
        $user = User::factory()->create();
        $user->assignRole('delivery'); // Required for subdomain role middleware

        $response = $this->post("http://delivery.{$baseDomain}/login", [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect("http://delivery.{$baseDomain}/dashboard");
    }

    public function test_users_can_not_authenticate_with_invalid_password(): void
    {
        $baseDomain = config('app.system_domain', 'duka.local');
        $user = User::factory()->create();

        $this->post("http://delivery.{$baseDomain}/login", [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $this->assertGuest();
    }

    public function test_users_can_logout(): void
    {
        $baseDomain = config('app.system_domain', 'duka.local');
        $user = User::factory()->create();
        $user->assignRole('delivery');

        $response = $this->actingAs($user)->post("http://delivery.{$baseDomain}/logout");

        $this->assertGuest();
        $response->assertRedirect("http://delivery.{$baseDomain}/login"); // That app's login page
    }

    public function test_signing_out_from_an_inertia_page_is_a_full_page_visit(): void
    {
        $baseDomain = config('app.system_domain', 'duka.local');
        $user = User::factory()->create();
        $user->assignRole('seller');

        // An Inertia request cannot follow a plain redirect to another page
        // set, so sign-out answers 409 + X-Inertia-Location instead.
        $this->actingAs($user)
            ->withHeaders(['X-Inertia' => 'true'])
            ->post("http://seller.{$baseDomain}/logout")
            ->assertStatus(409)
            ->assertHeader('X-Inertia-Location', "http://seller.{$baseDomain}/login");

        $this->assertGuest();
    }
}