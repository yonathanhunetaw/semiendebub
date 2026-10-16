<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Auth\User;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * TransferPolicy, StorePolicy and WarehousePolicy through the Gate: who may
 * see, approve, move and cancel a transfer, and who oversees a facility.
 */
class AuthorizationPoliciesTest extends TestCase
{
    use RefreshDatabase;

    private Store $a;

    private Store $b;

    private Store $c;

    protected function setUp(): void
    {
        parent::setUp();

        $this->a = Store::factory()->create(['name' => 'Store A', 'type' => Store::TYPE_RETAIL]);
        $this->b = Store::factory()->create(['name' => 'Store B', 'type' => Store::TYPE_RETAIL]);
        $this->c = Store::factory()->create(['name' => 'Store C', 'type' => Store::TYPE_RETAIL]);
    }

    private function user(string $role, ?Store $store = null): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $store?->id]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function transfer(Store $from, Store $to, string $approval = Transfer::APPROVAL_NOT_REQUIRED): Transfer
    {
        return Transfer::query()->create([
            'reference' => 'TRF-'.uniqid(), 'item_variant_id' => ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id])->id,
            'from_store_id' => $from->id, 'to_store_id' => $to->id,
            'source_location_type' => Store::class, 'source_location_id' => $from->id,
            'destination_location_type' => Store::class, 'destination_location_id' => $to->id,
            'quantity' => 3, 'status' => 'pending', 'origin' => Transfer::ORIGIN_AUTO, 'approval_state' => $approval,
        ]);
    }

    private function allows(User $user, string $ability, mixed $subject): bool
    {
        return Gate::forUser($user)->allows($ability, $subject);
    }

    // ---- TransferPolicy ----------------------------------------------------

    #[Test]
    public function the_transfer_list_is_for_admins_sellers_keepers_and_managers(): void
    {
        foreach (['admin', 'seller', 'stock_keeper', 'store_manager'] as $role) {
            $this->assertTrue($this->allows($this->user($role, $this->a), 'viewAny', Transfer::class), $role);
        }
        $this->assertFalse($this->allows($this->user('delivery'), 'viewAny', Transfer::class));
    }

    #[Test]
    public function a_transfer_is_seen_by_its_stores_a_keeper_and_the_admins_who_reach_it(): void
    {
        $transfer = $this->transfer($this->a, $this->b);

        $this->assertTrue($this->allows($this->user('admin'), 'view', $transfer), 'global admin');
        $this->assertTrue($this->allows($this->user('admin', $this->b), 'view', $transfer), 'admin of one end');
        $this->assertFalse($this->allows($this->user('admin', $this->c), 'view', $transfer), 'admin of neither end');
        $this->assertTrue($this->allows($this->user('stock_keeper', $this->c), 'view', $transfer), 'any keeper');
        $this->assertTrue($this->allows($this->user('seller', $this->a), 'view', $transfer), 'seller of one end');
        $this->assertFalse($this->allows($this->user('seller', $this->c), 'view', $transfer));
        $this->assertFalse($this->allows($this->user('seller'), 'view', $transfer), 'a seller with no store');
    }

    #[Test]
    public function only_a_proposal_awaiting_approval_can_be_approved_or_rejected(): void
    {
        $settled = $this->transfer($this->a, $this->b);

        $this->assertFalse($this->allows($this->user('admin'), 'approve', $settled));
        $this->assertFalse($this->allows($this->user('admin'), 'reject', $settled));
    }

    #[Test]
    public function a_proposal_is_ruled_on_by_the_destinations_manager_or_an_admin_who_reaches_it(): void
    {
        $proposal = $this->transfer($this->a, $this->b, Transfer::APPROVAL_PENDING);

        $this->assertTrue($this->allows($this->user('admin'), 'approve', $proposal));
        $this->assertFalse($this->allows($this->user('admin', $this->c), 'approve', $proposal));

        $this->assertTrue($this->allows($this->user('store_manager', $this->b), 'approve', $proposal), 'manager posted at the destination');
        $this->assertFalse($this->allows($this->user('store_manager', $this->c), 'approve', $proposal), 'manager of an unrelated store');

        $assigned = $this->user('store_manager', $this->c);
        $this->b->syncManagers([$assigned->id]);
        $this->assertTrue($this->allows($assigned->refresh(), 'reject', $proposal), 'assigned manager of the destination');

        $this->assertFalse($this->allows($this->user('seller', $this->b), 'approve', $proposal), 'a seller cannot approve');
    }

    #[Test]
    public function a_proposal_cannot_be_dispatched_until_approved_then_floor_staff_move_it(): void
    {
        $proposal = $this->transfer($this->a, $this->b, Transfer::APPROVAL_PENDING);
        $this->assertFalse($this->allows($this->user('admin'), 'dispatch', $proposal));

        $proposal->update(['approval_state' => Transfer::APPROVAL_APPROVED]);
        $this->assertTrue($this->allows($this->user('admin'), 'dispatch', $proposal));
        $this->assertTrue($this->allows($this->user('stock_keeper', $this->c), 'dispatch', $proposal));
        $this->assertTrue($this->allows($this->user('seller', $this->a), 'dispatch', $proposal));
        $this->assertFalse($this->allows($this->user('seller', $this->c), 'dispatch', $proposal));
        $this->assertFalse($this->allows($this->user('admin', $this->c), 'dispatch', $proposal));
    }

    #[Test]
    public function a_transfer_is_cancelled_by_its_stores_a_keeper_or_an_admin_who_reaches_it(): void
    {
        $transfer = $this->transfer($this->a, $this->b);

        $this->assertTrue($this->allows($this->user('admin', $this->a), 'cancel', $transfer));
        $this->assertTrue($this->allows($this->user('stock_keeper'), 'cancel', $transfer));
        $this->assertTrue($this->allows($this->user('seller', $this->b), 'cancel', $transfer));
        $this->assertFalse($this->allows($this->user('seller', $this->c), 'cancel', $transfer));
        $this->assertFalse($this->allows($this->user('delivery'), 'cancel', $transfer));
    }

    // ---- StorePolicy ---------------------------------------------------------

    #[Test]
    public function a_retail_store_is_overseen_by_its_staff_managers_and_reaching_admins(): void
    {
        $this->assertTrue($this->allows($this->user('admin'), 'oversee', $this->a));
        $this->assertTrue($this->allows($this->user('admin', $this->a), 'view', $this->a));
        $this->assertFalse($this->allows($this->user('admin', $this->b), 'update', $this->a));

        $this->assertTrue($this->allows($this->user('seller', $this->a), 'oversee', $this->a), 'posted staff');
        $this->assertFalse($this->allows($this->user('seller', $this->b), 'oversee', $this->a));
        $this->assertFalse($this->allows($this->user('seller'), 'oversee', $this->a));

        $manager = $this->user('store_manager', $this->b);
        $this->a->syncManagers([$manager->id]);
        $this->assertTrue($this->allows($manager->refresh(), 'oversee', $this->a), 'assigned manager');
    }

    #[Test]
    public function a_warehouse_has_no_posted_staff_fallback(): void
    {
        $hub = Store::factory()->create(['name' => 'Hub', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);

        $this->assertFalse($this->allows($this->user('stock_keeper', $hub), 'oversee', $hub), 'posted but not assigned');

        $keeper = $this->user('stock_keeper', $hub);
        $hub->syncManagers([$keeper->id]);
        $this->assertTrue($this->allows($keeper->refresh(), 'oversee', $hub));
    }

    #[Test]
    public function appointing_managers_is_for_admins_and_capacity_needs_a_manager_who_oversees(): void
    {
        $this->assertTrue($this->allows($this->user('admin'), 'assignManagers', $this->a));
        $this->assertFalse($this->allows($this->user('store_manager', $this->a), 'assignManagers', $this->a));

        $this->assertTrue($this->allows($this->user('store_manager', $this->a), 'manageCapacity', $this->a));
        $this->assertFalse($this->allows($this->user('seller', $this->a), 'manageCapacity', $this->a), 'staff, but not a manager');
        $this->assertFalse($this->allows($this->user('store_manager', $this->b), 'manageCapacity', $this->a));
    }

    // ---- WarehousePolicy -----------------------------------------------------

    #[Test]
    public function a_warehouse_is_overseen_only_by_its_managers_and_admins(): void
    {
        $warehouse = Warehouse::create(['name' => 'Main Distribution Hub A', 'code' => 'WH-MAIN-01']);
        $manager = $this->user('stock_keeper');
        $stranger = $this->user('seller');
        $warehouse->syncManagers([$manager->id]);
        $manager->refresh();

        $this->assertTrue($this->allows($this->user('admin'), 'viewAny', Warehouse::class));
        $this->assertTrue($this->allows($manager, 'viewAny', Warehouse::class), 'manages one');
        $this->assertFalse($this->allows($stranger, 'viewAny', Warehouse::class));
        $this->assertTrue($this->allows($this->user('stock_keeper'), 'viewAny', Warehouse::class), 'keepers hold the network-wide view');

        foreach (['view', 'oversee', 'update'] as $ability) {
            $this->assertTrue($this->allows($manager, $ability, $warehouse), $ability);
            $this->assertFalse($this->allows($stranger, $ability, $warehouse), $ability);
        }

        foreach (['delete', 'assignManagers'] as $ability) {
            $this->assertTrue($this->allows($this->user('admin'), $ability, $warehouse));
            $this->assertFalse($this->allows($manager, $ability, $warehouse), 'a manager cannot '.$ability);
        }
        $this->assertTrue($this->allows($this->user('admin'), 'create', Warehouse::class));
        $this->assertFalse($this->allows($manager, 'create', Warehouse::class));
    }
}
