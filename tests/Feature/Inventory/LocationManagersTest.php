<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Store\Store;
use App\Services\Inventory\StockLocationTree;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Admin → Inventory → Locations: every shelf, store floor, Remote Hub and
 * Main Hub, each with up to two managers.
 */
class LocationManagersTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Store $store;

    private StockLocation $hubA;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'stock_keeper', 'seller'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->admin = $this->user('admin');
        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        app(StockLocationTree::class)->addRemoteHub($this->store);
        $warehouse = Warehouse::create(['name' => 'Main Distribution Hub A', 'code' => 'WH-MAIN-01']);
        $this->hubA = StockLocation::query()->legacy(Warehouse::class, $warehouse->id)->sole();
    }

    #[Test]
    public function the_page_lists_the_hubs_and_each_stores_shelf_floor_and_remote_hub(): void
    {
        $this->asAdmin()
            ->get(route('admin.inventory.stock-locations.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Inventory/Locations/index')
                ->where('hubs.0.name', 'Main Distribution Hub A')
                ->where('stores.0.name', 'Main Store')
                ->where('stores.0.locations', fn ($locations) => collect($locations)->pluck('kind')->all()
                    === [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM, StockLocation::KIND_REMOTE_HUB]));
    }

    #[Test]
    public function an_admin_appoints_any_number_of_managers_primary_first_with_their_ticks(): void
    {
        [$first, $second, $third] = [$this->user('stock_keeper'), $this->user('stock_keeper'), $this->user('seller')];

        // The older form still works: everyone named gets every tick.
        $this->asAdmin()
            ->post(route('admin.inventory.stock-locations.managers', $this->hubA), ['manager_ids' => [$second->id, $first->id]])
            ->assertSessionHasNoErrors();

        $this->assertTrue($this->hubA->isManagedBy($first));
        $this->assertSame($second->id, $this->hubA->primaryManager()?->id);

        // A third is no longer refused, and each carries their own ticks.
        $this->asAdmin()
            ->post(route('admin.inventory.stock-locations.managers', $this->hubA), ['managers' => [
                ['user_id' => $first->id, 'abilities' => \App\Models\Inventory\FacilityManager::ABILITIES],
                ['user_id' => $second->id, 'abilities' => []],
                ['user_id' => $third->id, 'abilities' => [\App\Models\Inventory\FacilityManager::SHELVE]],
            ]])
            ->assertSessionHasNoErrors();

        $this->assertTrue($this->hubA->isManagedBy($third));
        $this->assertSame($first->id, $this->hubA->primaryManager()?->id);
        $this->assertSame([], $this->hubA->managerAssignmentFor($second)->grantedAbilities());
        $this->assertSame([\App\Models\Inventory\FacilityManager::SHELVE], $this->hubA->managerAssignmentFor($third)->grantedAbilities());

        // An unknown tick is refused.
        $this->asAdmin()
            ->post(route('admin.inventory.stock-locations.managers', $this->hubA), ['managers' => [['user_id' => $first->id, 'abilities' => ['fly']]]])
            ->assertSessionHasErrors('managers.0.abilities.0');
    }

    #[Test]
    public function an_admin_assigns_stock_keepers_to_a_location(): void
    {
        $keepers = [$this->user('stock_keeper'), $this->user('stock_keeper'), $this->user('stock_keeper')];

        $this->asAdmin()
            ->post(route('admin.inventory.stock-locations.staff', $this->hubA), ['staff_ids' => array_map(fn ($k) => $k->id, $keepers)])
            ->assertSessionHasNoErrors();

        $this->assertSame(3, $this->hubA->staffAssignments()->count());
        $this->assertTrue($this->hubA->isStaffedBy($keepers[2]));

        $this->asAdmin()
            ->get(route('admin.inventory.stock-locations.index'))
            ->assertInertia(fn ($page) => $page->has('abilities', count(\App\Models\Inventory\FacilityManager::ABILITIES))->has('staff_candidates'));
    }

    #[Test]
    public function an_empty_list_leaves_the_location_run_by_role(): void
    {
        $keeper = $this->user('stock_keeper');
        $this->hubA->syncManagers([$keeper->id]);
        $this->assertFalse($this->hubA->canBeOperatedBy($this->user('stock_keeper')));

        $this->asAdmin()
            ->post(route('admin.inventory.stock-locations.managers', $this->hubA), ['manager_ids' => []])
            ->assertSessionHasNoErrors();

        $this->assertTrue($this->hubA->canBeOperatedBy($this->user('stock_keeper')));
    }

    private function user(string $role): User
    {
        $user = User::factory()->create(['role' => $role]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function asAdmin(): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->admin, 'web');

        return $this;
    }
}
