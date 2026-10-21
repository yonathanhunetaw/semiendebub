<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\FacilityManager;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Services\Inventory\StockLocationTree;
use App\Services\Inventory\StockPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * StockPermissions at its edges: nobody signed in may do anything, a store
 * that has no node lists nobody, the people page lists managers with their
 * ticks and keepers, and a legacy Store-facility manager keeps their ticks.
 */
class StockPermissionsEdgesTest extends TestCase
{
    use RefreshDatabase;

    private StockPermissions $permissions;

    private Store $store;

    private StockLocation $shelf;

    protected function setUp(): void
    {
        parent::setUp();

        $this->permissions = app(StockPermissions::class);
        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
    }

    private function user(string $role, ?int $storeId = null, string $first = 'Abebe'): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId, 'first_name' => $first, 'last_name' => 'K']);
        $user->assignRole($role);

        return $user->refresh();
    }

    #[Test]
    public function nobody_signed_in_may_do_anything(): void
    {
        $remote = app(StockLocationTree::class)->addRemoteHub($this->store);
        $p = $this->permissions;
        $storeId = (int) $this->store->id;

        $this->assertFalse($p->isGlobalAdmin(null));
        $this->assertFalse($p->isAdminOf(null, 1));
        $this->assertFalse($p->managerAllows(null, $this->shelf, FacilityManager::ABILITIES[0]));
        $this->assertFalse($p->isManagerOf(null, $this->shelf));
        $this->assertFalse($p->isStaffOf(null, $this->shelf));
        $this->assertFalse($p->canViewShelf(null, $this->shelf));
        $this->assertFalse($p->canEditPlanogram(null, $this->shelf));
        $this->assertFalse($p->canRaiseRefill(null, $this->shelf));
        $this->assertFalse($p->canShelve(null, $this->shelf));
        $this->assertFalse($p->canAcceptAtRemote(null, $remote));
        $this->assertFalse($p->isStoreManager(null, $storeId));
        $this->assertFalse($p->canSetRefillRoute(null, $storeId));
        $this->assertFalse($p->canAddToRemoteList(null, $storeId));
        $this->assertFalse($p->canAddToManifest(null, $storeId));
        $this->assertFalse($p->canAdjustOrCancel(null, $storeId));
        $this->assertFalse($p->canRuleOnRefills(null, $storeId));
    }

    #[Test]
    public function accepting_at_the_remote_hub_needs_a_remote_hub(): void
    {
        $this->assertFalse($this->permissions->canAcceptAtRemote($this->user('admin'), $this->shelf));
    }

    #[Test]
    public function a_store_with_no_node_lists_nobody_and_is_managed_by_nobody(): void
    {
        $this->assertSame([], $this->permissions->peopleOf(999999));
        $this->assertNull($this->permissions->storeNode(999999));
        $this->assertFalse($this->permissions->isStoreManager($this->user('seller', (int) $this->store->id), null));
    }

    #[Test]
    public function the_people_page_lists_managers_with_their_ticks_and_the_keepers(): void
    {
        $manager = $this->user('store_manager', (int) $this->store->id, 'Meron');
        $keeper = $this->user('stock_keeper', (int) $this->store->id, 'Dawit');
        $this->shelf->syncManagers([$manager->id], null, [$manager->id => [FacilityManager::ABILITIES[0]]]);
        $this->shelf->syncStaff([$keeper->id]);

        $people = collect($this->permissions->peopleOf((int) $this->store->id));

        $meron = $people->firstWhere('name', 'Meron K');
        $this->assertSame('Manager', $meron['role']);
        $this->assertSame([FacilityManager::ABILITIES[0]], $meron['ticks']);
        $this->assertSame('Stock keeper', $people->firstWhere('name', 'Dawit K')['role']);
    }

    #[Test]
    public function a_legacy_store_facility_manager_keeps_their_own_ticks(): void
    {
        $manager = $this->user('seller', (int) $this->store->id);
        $this->store->syncManagers([$manager->id], null, [$manager->id => [FacilityManager::ABILITIES[0]]]);
        $manager->refresh();

        $this->assertTrue($this->permissions->isStoreManager($manager, (int) $this->store->id));
        $this->assertFalse($this->permissions->isStoreManager($this->user('seller', (int) $this->store->id), (int) $this->store->id));
    }
}
