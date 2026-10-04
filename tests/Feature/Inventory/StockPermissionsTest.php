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
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\Test;
use ReflectionClass;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Who may do what with a shelf and its refills.
 *
 * Managers are assignments, not roles; any number per location, each with tick
 * boxes. A store's managers and stock keepers reach its shelf, floor and
 * Remote Hub. An unmanaged shelf's planogram is admin/dev only.
 */
class StockPermissionsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $node;

    private StockLocation $shelf;

    private StockLocation $floor;

    private StockLocation $remote;

    private StockPermissions $permissions;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'dev', 'seller', 'stock_keeper', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $this->node = $this->at(StockLocation::KIND_STORE);
        $this->shelf = $this->at(StockLocation::KIND_SHELF);
        $this->floor = $this->at(StockLocation::KIND_BACKROOM);
        $this->remote = app(StockLocationTree::class)->addRemoteHub($this->store);
        $this->permissions = app(StockPermissions::class);
    }

    #[Test]
    public function a_location_takes_any_number_of_managers(): void
    {
        $managers = collect(range(1, 5))->map(fn (): User => $this->user('seller'));

        $this->shelf->syncManagers($managers->pluck('id')->all());

        $this->assertSame(5, $this->shelf->managerAssignments()->count());
        $managers->each(fn (User $m) => $this->assertTrue($this->permissions->canEditPlanogram($m, $this->shelf)));
    }

    #[Test]
    public function a_manager_may_do_only_what_is_ticked(): void
    {
        $manager = $this->user('seller');
        $this->shelf->syncManagers([$manager->id], null, [$manager->id => [FacilityManager::SHELVE]]);

        $this->assertTrue($this->permissions->canShelve($manager, $this->shelf));
        $this->assertFalse($this->permissions->canEditPlanogram($manager, $this->shelf));

        // Re-saving without abilities keeps the ticks; naming them replaces them.
        $this->shelf->syncManagers([$manager->id]);
        $this->assertFalse($this->permissions->canEditPlanogram($manager, $this->shelf));
        $this->shelf->syncManagers([$manager->id], null, [$manager->id => FacilityManager::ABILITIES]);
        $this->assertTrue($this->permissions->canEditPlanogram($manager, $this->shelf));
    }

    #[Test]
    public function a_new_manager_gets_every_tick_and_an_unknown_tick_is_refused(): void
    {
        $manager = $this->user('seller');
        $this->shelf->syncManagers([$manager->id]);

        $this->assertSame(FacilityManager::ABILITIES, $this->shelf->managerAssignmentFor($manager)->grantedAbilities());

        $this->expectException(InvalidArgumentException::class);
        $this->shelf->syncManagers([$manager->id], null, [$manager->id => ['fly_the_plane']]);
    }

    #[Test]
    public function the_store_managers_run_its_shelf_floor_and_remote_hub_with_their_ticks(): void
    {
        $manager = $this->user('seller', null);
        $this->node->syncManagers([$manager->id], null, [$manager->id => [
            FacilityManager::EDIT_PLANOGRAM, FacilityManager::ADD_TO_MANIFEST, FacilityManager::ACCEPT_AT_REMOTE,
        ]]);

        $this->assertTrue($this->permissions->isStoreManager($manager, $this->store->id));
        $this->assertTrue($this->permissions->canEditPlanogram($manager, $this->shelf));
        $this->assertTrue($this->permissions->canEditPlanogram($manager, $this->remote));
        $this->assertTrue($this->permissions->canAddToManifest($manager, $this->store->id));
        $this->assertTrue($this->permissions->canAcceptAtRemote($manager, $this->remote));
        $this->assertTrue($this->permissions->canViewShelf($manager, $this->shelf));

        // Not ticked: not allowed, at any level.
        $this->assertFalse($this->permissions->canAddToRemoteList($manager, $this->store->id));
        $this->assertFalse($this->permissions->canSetRefillRoute($manager, $this->store->id));
        $this->assertFalse($this->permissions->canShelve($manager, $this->shelf));

        // A manager of another store reaches none of it.
        $other = $this->user('seller', null);
        $this->at(StockLocation::KIND_STORE, Store::factory()->create()->id)->syncManagers([$other->id]);
        $this->assertFalse($this->permissions->canEditPlanogram($other, $this->shelf));
    }

    #[Test]
    public function an_unmanaged_shelf_is_admin_and_dev_only_but_everyone_in_the_store_sees_it(): void
    {
        $seller = $this->user('seller');

        $this->assertFalse($this->permissions->canEditPlanogram($seller, $this->shelf));
        $this->assertTrue($this->permissions->canEditPlanogram($this->user('admin', null), $this->shelf));
        $this->assertTrue($this->permissions->canEditPlanogram($this->user('dev', null), $this->shelf));

        $this->assertTrue($this->permissions->canViewShelf($seller, $this->shelf));
        $this->assertTrue($this->permissions->canViewShelf($this->user('stock_keeper'), $this->shelf));
        $this->assertFalse($this->permissions->canViewShelf($this->user('seller', Store::factory()->create()->id), $this->shelf));
    }

    #[Test]
    public function assigned_stock_keepers_suggest_and_shelve_and_once_assigned_the_store_id_rule_stops(): void
    {
        // Nobody assigned yet: the store's stock keepers by users.store_id.
        $byStore = $this->user('stock_keeper');
        $this->assertTrue($this->permissions->canShelve($byStore, $this->shelf));
        $this->assertTrue($this->permissions->canRaiseRefill($byStore, $this->shelf));

        // Assign one keeper to the whole store: they reach the shelf and the hub; the other no longer does.
        $assigned = $this->user('stock_keeper', null);
        $this->node->syncStaff([$assigned->id]);

        $this->assertTrue($this->permissions->canShelve($assigned, $this->shelf));
        $this->assertTrue($this->permissions->canRaiseRefill($assigned, $this->shelf));
        $this->assertTrue($this->permissions->canAcceptAtRemote($assigned, $this->remote));
        $this->assertFalse($this->permissions->canShelve($byStore, $this->shelf));

        // Stock keepers never rule on suggestions or edit the planogram.
        $this->assertFalse($this->permissions->canRuleOnRefills($assigned, $this->store->id));
        $this->assertFalse($this->permissions->canEditPlanogram($assigned, $this->shelf));

        // Any number per location.
        $more = collect(range(1, 4))->map(fn (): User => $this->user('stock_keeper', null))->pluck('id')->all();
        $this->shelf->syncStaff($more);
        $this->assertSame(4, $this->shelf->staffAssignments()->count());
    }

    #[Test]
    public function an_assigned_stock_keeper_may_hand_stock_in_and_out_of_a_managed_shelf(): void
    {
        $manager = $this->user('seller', null);
        $keeper = $this->user('stock_keeper', null);
        $stranger = $this->user('stock_keeper', null);
        $this->shelf->syncManagers([$manager->id]);
        $this->node->syncStaff([$keeper->id]);

        $this->assertTrue($this->shelf->canBeOperatedBy($manager));
        $this->assertTrue($this->shelf->canBeOperatedBy($keeper));
        $this->assertFalse($this->shelf->canBeOperatedBy($stranger));
    }

    #[Test]
    public function a_store_manager_by_role_counts_only_for_their_own_store(): void
    {
        $this->assertTrue($this->permissions->canRuleOnRefills($this->user('store_manager'), $this->store->id));
        $this->assertFalse($this->permissions->canRuleOnRefills($this->user('store_manager', Store::factory()->create()->id), $this->store->id));
        $this->assertFalse($this->permissions->canRuleOnRefills($this->user('seller'), $this->store->id));
        $this->assertFalse($this->permissions->canRuleOnRefills($this->user('stock_keeper'), $this->store->id));
    }

    #[Test]
    public function a_store_shelf_belongs_to_one_store_for_good(): void
    {
        $other = Store::factory()->create();
        $otherNode = $this->at(StockLocation::KIND_STORE, $other->id);

        try {
            $this->shelf->update(['parent_id' => $otherNode->id, 'store_id' => $other->id]);
            $this->fail('A shelf was moved to another store.');
        } catch (InvalidArgumentException) {
            $this->assertSame($this->store->id, (int) $this->shelf->fresh()->store_id);
        }

        $this->expectException(InvalidArgumentException::class);
        StockLocation::query()->create([
            'kind' => StockLocation::KIND_SHELF, 'name' => 'Stray Shelf', 'code' => 'STRAY-SHELF',
            'store_id' => $this->store->id, 'parent_id' => $otherNode->id, 'is_stockable' => true,
        ]);
    }

    #[Test]
    public function the_permissions_page_lists_who_runs_the_store_with_their_ticks(): void
    {
        $manager = $this->user('seller', null);
        $keeper = $this->user('stock_keeper', null);
        $this->node->syncManagers([$manager->id], null, [$manager->id => [FacilityManager::ADD_TO_MANIFEST]]);
        $this->shelf->syncStaff([$keeper->id]);

        $people = collect($this->permissions->peopleOf($this->store->id))->keyBy('role');

        $this->assertSame(['Whole store', [FacilityManager::ADD_TO_MANIFEST]], [$people['Manager']['where'], $people['Manager']['ticks']]);
        $this->assertSame('Store Shelf', $people['Stock keeper']['where']);
    }

    #[Test]
    public function the_catalogue_lists_every_ability_once_and_every_tick_has_a_label(): void
    {
        $abilities = collect((new ReflectionClass(StockPermissions::class))->getConstants())
            ->except(['TICK_LABELS'])
            ->values()->sort()->values()->all();
        $listed = collect(StockPermissions::catalogue())->pluck('key')->sort()->values()->all();

        $this->assertSame($abilities, $listed);
        $this->assertSame(FacilityManager::ABILITIES, array_keys(StockPermissions::TICK_LABELS));
    }

    private function at(string $kind, ?int $storeId = null): StockLocation
    {
        return StockLocation::query()->where('store_id', $storeId ?? $this->store->id)->where('kind', $kind)->sole();
    }

    private function user(string $role, ?int $storeId = -1): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId === -1 ? $this->store->id : $storeId]);
        $user->assignRole($role);

        return $user;
    }
}
