<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\Shift;
use App\Models\Workforce\StaffingRule;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\RotaService;
use App\Services\Workforce\Sites;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Work reads roles as they are held, not as the host reads them. Someone with
 * several roles is "the seller" on the seller app (User::roleKey), but a global
 * admin ticked as seller still manages every site from there, and a rota's
 * coverage does not change with the app the manager looks from.
 */
class WorkRolesOnAnyHostTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager', 'delivery', 'dev'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }
    }

    /** Stand on an app's host, as a request there would. */
    private function onHost(string $app): void
    {
        $this->app->instance('request', Request::create("http://{$app}.".config('app.system_domain').'/work'));
    }

    private function user(string $main, array $also = [], ?int $storeId = null): User
    {
        $user = User::factory()->create(['role' => $main, 'store_id' => $storeId]);
        $user->syncRoles([$main, ...$also]);

        return $user->fresh();
    }

    #[Test]
    public function a_global_admin_ticked_as_seller_still_manages_every_site_from_the_seller_app(): void
    {
        $store = Store::factory()->create();
        $site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $hub = StockLocation::factory()->mainHub()->create();
        $admin = $this->user('admin', ['seller', 'stock_keeper']);
        $sites = app(Sites::class);

        $this->onHost('seller');
        $this->assertSame('seller', $admin->roleKey(), 'The host reads them as a seller here.');
        $this->assertTrue($sites->isGlobalAdmin($admin));
        $this->assertTrue($sites->canManage($admin, $site));
        $this->assertTrue($sites->canManage($admin, $hub));

        // A store admin ticked as seller manages their own store's site from the seller app too.
        $storeAdmin = $this->user('admin', ['seller'], $store->id);
        $this->assertTrue($sites->canManage($storeAdmin, $site));
        $this->assertFalse($sites->canManage($storeAdmin, $hub));

        // And may give the cars' keys, as on the admin app.
        $car = Vehicle::factory()->create(['status' => Vehicle::STATUS_ACTIVE]);
        $this->assertTrue(app(KeyCustodyService::class)->canManage($admin, app(KeyCustodyService::class)->keyFor($car)));
    }

    #[Test]
    public function coverage_counts_a_seller_who_also_keeps_stock_as_a_seller_from_any_app(): void
    {
        $store = Store::factory()->create();
        $site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $both = $this->user('seller', ['stock_keeper'], $store->id);
        $shift = Shift::query()->create([
            'stock_location_id' => $site->id, 'user_id' => $both->id, 'starts_at' => now()->addDay(), 'ends_at' => now()->addDay()->addHours(6),
            'status' => Shift::STATUS_PUBLISHED, 'duty' => Shift::DUTY_NONE, 'created_by' => $both->id,
        ]);
        $rota = app(RotaService::class);

        foreach (['admin', 'stockkeeper', 'seller'] as $app) {
            $this->onHost($app);
            $shift->unsetRelation('user');
            $this->assertTrue($rota->counts($shift, StaffingRule::ROLE_SELLER), "As a seller, seen from {$app}.");
            $this->assertTrue($rota->counts($shift, StaffingRule::ROLE_STOCK_KEEPER), "As a stock keeper, seen from {$app}.");
        }
    }
}
