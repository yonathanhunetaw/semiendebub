<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Auth\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ImpersonationTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, array $also = [], ?int $storeId = null): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->syncRoles([$role, ...$also]);

        return $user;
    }

    private function storeId(): int
    {
        return \App\Models\Store\Store::factory()->create()->id;
    }

    private function token(User $admin, User $target, string $host): string
    {
        $token = str_repeat('a', 48);
        Cache::put('impersonate:'.hash('sha256', $token), ['user_id' => $target->id, 'admin_id' => $admin->id, 'host' => $host], 60);

        return $token;
    }

    private function inertia(): array
    {
        return ['X-Inertia' => 'true'];
    }

    #[Test]
    public function a_global_admin_opens_a_seller_and_is_sent_to_the_sellers_app_with_a_token(): void
    {
        $base = config('app.system_domain');
        $admin = $this->user('admin');
        $seller = $this->user('seller');

        $response = $this->actingAs($admin)->post("http://admin.{$base}/impersonate", ['user_id' => $seller->id], $this->inertia());

        $response->assertStatus(409);
        $this->assertStringStartsWith("http://seller.{$base}/impersonate/", $response->headers->get('X-Inertia-Location'));
    }

    #[Test]
    public function the_token_signs_the_seller_in_once_and_remembers_the_admin(): void
    {
        $base = config('app.system_domain');
        $admin = $this->user('admin');
        $seller = $this->user('seller');
        $token = $this->token($admin, $seller, "seller.{$base}");

        $this->get("http://seller.{$base}/impersonate/{$token}")->assertRedirect('/dashboard');

        $this->assertAuthenticatedAs($seller);
        $this->assertSame($admin->id, session('impersonator.id'));
        $this->assertFalse(session('impersonator.self'));

        $this->get("http://seller.{$base}/impersonate/{$token}")->assertForbidden();
    }

    #[Test]
    public function a_token_only_works_on_the_host_it_was_made_for(): void
    {
        $base = config('app.system_domain');
        $admin = $this->user('admin');
        $seller = $this->user('seller');
        $token = $this->token($admin, $seller, "seller.{$base}");

        $this->get("http://finance.{$base}/impersonate/{$token}")->assertForbidden();
        $this->assertGuest();
    }

    #[Test]
    public function only_an_admin_may_switch_and_never_into_an_admin(): void
    {
        $base = config('app.system_domain');
        $seller = $this->user('seller');
        $keeper = $this->user('stock_keeper');
        $otherAdmin = $this->user('admin');

        $this->actingAs($seller)->post("http://seller.{$base}/impersonate", ['user_id' => $keeper->id])->assertForbidden();
        $this->actingAs($this->user('admin'))->post("http://admin.{$base}/impersonate", ['user_id' => $otherAdmin->id])->assertForbidden();
    }

    #[Test]
    public function a_global_admin_can_open_their_own_account_in_any_app(): void
    {
        $base = config('app.system_domain');
        $admin = $this->user('admin');

        $response = $this->actingAs($admin)->post("http://admin.{$base}/impersonate", ['role' => 'delivery'], $this->inertia());

        $response->assertStatus(409);
        $this->assertStringStartsWith("http://delivery.{$base}/impersonate/", $response->headers->get('X-Inertia-Location'));
    }

    #[Test]
    public function opening_your_own_account_is_marked_as_self(): void
    {
        $base = config('app.system_domain');
        $admin = $this->user('admin');
        $token = $this->token($admin, $admin, "delivery.{$base}");

        $this->get("http://delivery.{$base}/impersonate/{$token}")->assertRedirect('/dashboard');

        $this->assertAuthenticatedAs($admin);
        $this->assertTrue(session('impersonator.self'));
    }

    #[Test]
    public function a_store_admin_switches_only_between_the_roles_they_are_ticked_for(): void
    {
        $base = config('app.system_domain');
        $store = $this->storeId();
        $storeAdmin = $this->user('admin', ['seller'], $store);
        $seller = $this->user('seller', [], $store);

        $listing = $this->actingAs($storeAdmin)->getJson("http://admin.{$base}/impersonate/users")->assertOk()->json();
        $this->assertEqualsCanonicalizing(['admin', 'seller'], $listing['mine']);
        $this->assertSame([], $listing['people']);

        $this->actingAs($storeAdmin)->post("http://admin.{$base}/impersonate", ['role' => 'seller'], $this->inertia())->assertStatus(409);
        $this->actingAs($storeAdmin)->post("http://admin.{$base}/impersonate", ['role' => 'stock_keeper'])->assertForbidden();
        $this->actingAs($storeAdmin)->post("http://admin.{$base}/impersonate", ['user_id' => $seller->id])->assertForbidden();
    }

    #[Test]
    public function the_floating_apps_button_is_offered_only_to_an_admin_with_another_app_or_inside_an_opened_app(): void
    {
        $store = $this->storeId();
        $offered = function (?User $user, ?array $impersonator = null): bool {
            $request = \Illuminate\Http\Request::create('/');
            $request->setLaravelSession(app('session.store'));
            $request->session()->forget('impersonator');
            if ($impersonator) {
                $request->session()->put('impersonator', $impersonator);
            }
            $request->setUserResolver(fn () => $user);

            return app(\App\Http\Controllers\Admin\ImpersonationController::class)->offered($request);
        };

        $this->assertTrue($offered($this->user('admin')));
        $this->assertTrue($offered($this->user('admin', ['seller'], $store)));
        $this->assertFalse($offered($this->user('admin', [], $store)));
        $this->assertFalse($offered($this->user('seller', [], $store)));
        $this->assertFalse($offered(null));
        $this->assertTrue($offered($this->user('seller', [], $store), ['id' => 1, 'name' => 'A', 'self' => false]));
    }

    #[Test]
    public function the_listing_for_a_global_admin_has_every_app_and_the_people_but_no_admins(): void
    {
        $base = config('app.system_domain');
        $admin = $this->user('admin');
        $seller = $this->user('seller');
        $this->user('admin');

        $listing = $this->actingAs($admin)->getJson("http://admin.{$base}/impersonate/users")->assertOk()->json();

        $this->assertContains('finance', $listing['mine']);
        $this->assertSame([$seller->id], array_column($listing['people'], 'id'));
    }

    #[Test]
    public function inside_an_opened_app_the_real_admin_can_switch_again(): void
    {
        $base = config('app.system_domain');
        $admin = $this->user('admin');
        $seller = $this->user('seller');
        $courier = $this->user('delivery');

        // Signed in as the seller, opened by the admin: the admin's authority applies.
        $response = $this->actingAs($seller)->withSession(['impersonator' => ['id' => $admin->id, 'name' => 'A', 'self' => false]])
            ->post("http://seller.{$base}/impersonate", ['user_id' => $courier->id], $this->inertia());

        $response->assertStatus(409);
        $this->assertStringStartsWith("http://delivery.{$base}/impersonate/", $response->headers->get('X-Inertia-Location'));
    }

    #[Test]
    public function stopping_signs_out_and_sends_the_admin_back(): void
    {
        $base = config('app.system_domain');
        $seller = $this->user('seller');

        $response = $this->actingAs($seller)->withSession(['impersonator' => ['id' => 1, 'name' => 'A', 'self' => false]])
            ->post("http://seller.{$base}/impersonate/stop", [], $this->inertia());

        $response->assertStatus(409);
        $this->assertSame("http://admin.{$base}/dashboard", $response->headers->get('X-Inertia-Location'));
        $this->assertGuest();
    }

    #[Test]
    public function stop_is_refused_when_nobody_opened_the_session(): void
    {
        $base = config('app.system_domain');

        $this->actingAs($this->user('seller'))->post("http://seller.{$base}/impersonate/stop")->assertForbidden();
    }
}
