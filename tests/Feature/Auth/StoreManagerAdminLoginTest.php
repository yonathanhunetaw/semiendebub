<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Auth\User;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * A store manager signing in on the admin app lands on what they may open there (the
 * approvals queue), not on the admin dashboard, which refuses them: in the browser that
 * 403 covered the login page and the manager could not get in at all.
 */
class StoreManagerAdminLoginTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function a_store_manager_signing_in_on_admin_lands_on_the_approvals(): void
    {
        Role::firstOrCreate(['name' => 'store_manager']);
        $manager = User::factory()->create(['role' => 'store_manager', 'store_id' => Store::factory()->create()->id, 'password' => 'secret-pass']);
        $manager->assignRole('store_manager');

        $admin = 'http://admin.'.config('app.system_domain');

        $this->post("{$admin}/login", ['email' => $manager->email, 'password' => 'secret-pass'])
            ->assertRedirect("{$admin}/inventory/replenishment");
        $this->get("{$admin}/inventory/replenishment")->assertOk();
        $this->get("{$admin}/inventory/counts")->assertOk();
        $this->get("{$admin}/dashboard")->assertForbidden();
    }
}
