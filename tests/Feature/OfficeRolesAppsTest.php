<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Auth\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Finance, Procurement, Marketing and Shared: the four small apps. Each has a
 * public welcome page, a guarded dashboard and (for some) a couple more pages.
 */
class OfficeRolesAppsTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{0: string, 1: string, 2: string}> subdomain, then page => component pairs are in pages() */
    public static function apps(): array
    {
        return [
            'finance' => ['finance'],
            'procurement' => ['procurement'],
            'marketing' => ['marketing'],
            'shared' => ['shared'],
        ];
    }

    /** @return array<string, array{0: string, 1: string, 2: string}> */
    public static function pages(): array
    {
        return [
            'finance dashboard' => ['finance', 'finance.dashboard', 'Finance/Dashboard/index'],
            'finance reports' => ['finance', 'finance.reports.index', 'Finance/Reports/index'],
            'procurement dashboard' => ['procurement', 'procurement.dashboard', 'Procurement/Dashboard/index'],
            'procurement purchase orders' => ['procurement', 'procurement.purchase_orders.index', 'Procurement/PurchaseOrders/index'],
            'marketing dashboard' => ['marketing', 'marketing.dashboard', 'Marketing/Dashboard/index'],
            'marketing campaigns' => ['marketing', 'marketing.campaigns.index', 'Marketing/Campaigns/index'],
            'shared dashboard' => ['shared', 'shared.dashboard', 'Shared/Dashboard/index'],
        ];
    }

    private function signIn(string $role): User
    {
        Role::findOrCreate($role);
        $user = User::factory()->create(['role' => $role, 'email_verified_at' => now()]);
        $user->assignRole($role);

        $this->withServerVariables(['HTTP_HOST' => $role.'.'.config('app.system_domain')]);
        $this->actingAs($user);

        return $user;
    }

    #[Test]
    #[DataProvider('pages')]
    public function each_page_opens_for_its_own_role(string $role, string $route, string $component): void
    {
        $this->signIn($role);

        $this->get(route($route))->assertOk()
            ->assertInertia(fn ($page) => $page->component($component));
    }

    #[Test]
    #[DataProvider('pages')]
    public function each_page_is_closed_to_guests(string $role, string $route): void
    {
        $this->withServerVariables(['HTTP_HOST' => $role.'.'.config('app.system_domain')]);

        $this->get(route($route))->assertRedirect(route("{$role}.login"));
    }

    #[Test]
    #[DataProvider('apps')]
    public function a_guest_sees_the_welcome_and_login_pages(string $role): void
    {
        $this->withServerVariables(['HTTP_HOST' => $role.'.'.config('app.system_domain')]);

        $this->get(route("{$role}.welcome"))->assertOk()
            ->assertInertia(fn ($page) => $page->component(ucfirst($role).'/Welcome/index'));
        $this->get(route("{$role}.login"))->assertOk();
    }

    // ---- Sessions (Finance and Marketing share the Admin session screen) ----

    private function seedSession(string $id, ?int $userId = null): void
    {
        DB::table('sessions')->insert([
            'id' => $id, 'user_id' => $userId, 'ip_address' => '10.0.0.1', 'user_agent' => 'phpunit',
            'payload' => base64_encode(serialize([])), 'last_activity' => now()->subMinutes(30)->timestamp,
        ]);
    }

    #[Test]
    #[DataProvider('sessionApps')]
    public function the_session_list_opens_and_a_session_can_be_ended(string $role): void
    {
        $this->signIn($role);
        $this->seedSession('to-end');

        $this->get(route("{$role}.sessions.index"))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Sessions/index')->has('sessions')->has('lifetimes'));

        $this->delete(route("{$role}.sessions.destroy", 'to-end'))->assertSessionHas('success');
        $this->assertDatabaseMissing('sessions', ['id' => 'to-end']);
    }

    #[Test]
    #[DataProvider('sessionApps')]
    public function ending_a_session_that_does_not_exist_reports_an_error(string $role): void
    {
        $this->signIn($role);

        $this->delete(route("{$role}.sessions.destroy", 'nope'))->assertSessionHas('error');
    }

    #[Test]
    #[DataProvider('sessionApps')]
    public function the_session_pages_are_closed_to_guests(string $role): void
    {
        $this->withServerVariables(['HTTP_HOST' => $role.'.'.config('app.system_domain')]);

        $this->get(route("{$role}.sessions.index"))->assertRedirect(route("{$role}.login"));
        $this->delete(route("{$role}.sessions.destroy", 'x'))->assertRedirect(route("{$role}.login"));
    }

    /** @return array<string, array{0: string}> */
    public static function sessionApps(): array
    {
        return ['finance' => ['finance'], 'marketing' => ['marketing']];
    }

    // ---- Debug routes ------------------------------------------------------

    #[Test]
    public function the_marketing_and_shared_debug_host_pages_answer_with_the_host(): void
    {
        foreach (['marketing', 'shared'] as $role) {
            $host = $role.'.'.config('app.system_domain');

            $this->get("http://{$host}/debug-host")->assertOk()
                ->assertJson(['host' => $host, 'expected' => config('app.system_domain')]);
        }
    }

    #[Test]
    public function the_shared_middleware_debug_page_lists_the_routes_middleware(): void
    {
        $host = 'shared.'.config('app.system_domain');

        $this->get("http://{$host}/debug-middleware")->assertOk()->assertJsonIsArray();
    }
}
