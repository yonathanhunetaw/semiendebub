<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Exceptions\MovementDomainException;
use App\Models\Auth\User;
use App\Models\Inventory\FacilityManager;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Fulfillment\MovementDomainService;
use App\Services\Inventory\LocationCapacityService;
use App\Services\Inventory\ReplenishmentProposalService;
use App\Services\TransferWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Variant capacity, and the proposals a breached floor raises.
 *
 * The invariant under test: the planner may only ever *suggest*. A proposal is
 * written unapproved, is absent from the active transfer list, and cannot move
 * a single unit until a store manager rules on it.
 */
class CapacityReplenishmentTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Store $hub;

    private StoreVariant $storeVariant;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'store_manager', 'stock_keeper'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        Permission::firstOrCreate(['name' => 'approve replenishment transfers']);

        // Store::booted() gives every new store a shop floor and a back room.
        $this->store = Store::factory()->create([
            'name' => 'Main Store',
            'type' => Store::TYPE_RETAIL,
        ]);

        $this->hub = Store::factory()->create([
            'name' => 'Warehouse A',
            'type' => Store::TYPE_CENTRAL_WAREHOUSE,
        ]);

        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $this->variant->id,
        ]);

        // Planogram first: the item has a bin on the shelf, so the planner may
        // propose stock onto it.
        ShelfItemBand::query()->create([
            'stock_location_id' => StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole()->id,
            'item_id' => $item->id,
            'max_units' => 100,
            'refill_units' => 10,
            'critical_units' => 5,
        ]);
    }

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

    private function capacity(): LocationCapacityService
    {
        return app(LocationCapacityService::class);
    }

    private function planner(): ReplenishmentProposalService
    {
        return app(ReplenishmentProposalService::class);
    }

    private function shelf(): ItemInventoryLocation
    {
        return $this->store->inventoryLocations()->shelves()->firstOrFail();
    }

    /** Units at a location, straight on the positional ledger. */
    private function stockAt(string $type, int $id, int $quantity): void
    {
        ItemStock::updateOrCreate(
            [
                'item_variant_id' => $this->variant->id,
                'location_type' => $type,
                'location_id' => $id,
            ],
            ['quantity' => $quantity, 'min_stock_level' => 0],
        );
    }

    private function userWithRole(string $role, ?int $storeId = null): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user->refresh();
    }

    /* ---------------------------------------------------------------------
     | Capacity bands
     |--------------------------------------------------------------------*/

    #[Test]
    public function a_band_can_be_set_at_every_level_of_the_hierarchy(): void
    {
        $levels = collect(app(MovementDomainService::class)->hierarchyFor($this->store));

        $this->assertEqualsCanonicalizing(
            ['shelf', 'backroom', 'store', 'main_warehouse'],
            $levels->pluck('kind')->unique()->values()->all(),
            'Capacity must be settable on shelves, back rooms, stores and warehouses alike.',
        );

        foreach ($levels as $level) {
            $this->capacity()->setBand($this->storeVariant, $level['type'], (int) $level['id'], 4, 40);
        }

        $this->assertSame($levels->count(), $this->storeVariant->capacities()->count());
    }

    #[Test]
    public function an_all_zero_band_withdraws_the_location_from_monitoring(): void
    {
        $shelf = $this->shelf();

        $this->capacity()->setBand($this->storeVariant, ItemInventoryLocation::class, (int) $shelf->id, 5, 20);
        $this->assertSame(1, $this->storeVariant->capacities()->count());

        $this->assertNull(
            $this->capacity()->setBand($this->storeVariant, ItemInventoryLocation::class, (int) $shelf->id, 0, 0),
        );
        $this->assertSame(0, $this->storeVariant->capacities()->count());
    }

    #[Test]
    public function the_floor_and_shelf_are_separate_and_the_store_is_both(): void
    {
        // STOCK_PLAN.md phase 4: shelf and floor are disjoint leaves. The
        // store-level row is the floor; the store's total is shelf + floor.
        $this->stockAt(Store::class, (int) $this->store->id, 100);
        $this->stockAt(ItemInventoryLocation::class, (int) $this->shelf()->id, 30);

        $backroom = $this->store->inventoryLocations()->backrooms()->firstOrFail();

        $this->assertSame(
            100,
            $this->capacity()->onHand((int) $this->variant->id, ItemInventoryLocation::class, (int) $backroom->id),
        );
        $this->assertSame(
            130,
            $this->capacity()->onHand((int) $this->variant->id, Store::class, (int) $this->store->id),
        );
    }

    /* ---------------------------------------------------------------------
     | Proposals
     |--------------------------------------------------------------------*/

    #[Test]
    public function a_breached_floor_raises_a_proposal_that_cannot_be_dispatched(): void
    {
        // 100 in the store, nothing on the shelf, so the back room can serve it.
        $this->stockAt(Store::class, (int) $this->store->id, 100);
        $this->capacity()->setBand($this->storeVariant, ItemInventoryLocation::class, (int) $this->shelf()->id, 5, 20);

        $outcome = $this->planner()->sweep([(int) $this->storeVariant->id]);

        $this->assertCount(1, $outcome['created']);

        $proposal = $outcome['created'][0];

        $this->assertSame(Transfer::ORIGIN_AUTO, $proposal->origin);
        $this->assertSame(Transfer::APPROVAL_PENDING, $proposal->approval_state);
        $this->assertSame('pending', $proposal->status);
        $this->assertSame(20, $proposal->quantity, 'A proposal tops the location up to its ceiling.');
        $this->assertSame('proposed', $proposal->ui_status);

        // The gate: unapproved means unmovable, whichever door it arrives at.
        $this->assertFalse(app(TransferWorkflowService::class)->markDispatched($proposal->fresh()));
        $this->assertSame(0, ItemStock::query()
            ->where('item_variant_id', $this->variant->id)
            ->where('location_type', ItemInventoryLocation::class)
            ->sum('quantity'), 'No stock may move before approval.');

        // And it is absent from the board the floor works to.
        $this->assertSame(0, Transfer::query()->active()->count());
        $this->assertSame(1, Transfer::query()->awaitingApproval()->count());
    }

    #[Test]
    public function one_open_proposal_per_location_is_enough(): void
    {
        $this->stockAt(Store::class, (int) $this->store->id, 100);
        $this->capacity()->setBand($this->storeVariant, ItemInventoryLocation::class, (int) $this->shelf()->id, 5, 20);

        $this->planner()->sweep([(int) $this->storeVariant->id]);
        $second = $this->planner()->sweep([(int) $this->storeVariant->id]);

        $this->assertCount(0, $second['created']);
        $this->assertSame(1, Transfer::query()->autoProposed()->count());
    }

    #[Test]
    public function a_location_with_no_band_is_never_proposed_for(): void
    {
        $this->stockAt(Store::class, (int) $this->store->id, 100);

        $outcome = $this->planner()->sweep([(int) $this->storeVariant->id]);

        $this->assertCount(0, $outcome['created'], 'Capacity is opt-in; an unmonitored shelf is not a shortfall.');
    }

    #[Test]
    public function a_stock_movement_is_noticed_without_waiting_for_the_nightly_sweep(): void
    {
        $this->stockAt(Store::class, (int) $this->store->id, 100);
        $this->stockAt(ItemInventoryLocation::class, (int) $this->shelf()->id, 30);
        $this->capacity()->setBand($this->storeVariant, ItemInventoryLocation::class, (int) $this->shelf()->id, 10, 40);

        $this->assertSame(0, Transfer::query()->autoProposed()->count());

        // A sale takes the shelf down through its floor. The observer on
        // item_stocks is what turns that into a proposal.
        ItemStock::query()
            ->where('item_variant_id', $this->variant->id)
            ->where('location_type', ItemInventoryLocation::class)
            ->where('location_id', $this->shelf()->id)
            ->first()
            ->update(['quantity' => 8]);

        $this->assertSame(1, Transfer::query()->awaitingApproval()->count());
    }

    /* ---------------------------------------------------------------------
     | The store manager's decision
     |--------------------------------------------------------------------*/

    #[Test]
    public function approval_admits_the_proposal_to_the_active_transfer_list(): void
    {
        $proposal = $this->raiseProposal();
        $manager = $this->userWithRole('store_manager', (int) $this->store->id);

        $this->assertTrue($this->planner()->approve($proposal, $manager, null));

        $proposal->refresh();

        $this->assertSame(Transfer::APPROVAL_APPROVED, $proposal->approval_state);
        $this->assertSame($manager->id, $proposal->approved_by);
        $this->assertSame(1, Transfer::query()->active()->count());
        $this->assertTrue(app(TransferWorkflowService::class)->markDispatched($proposal->fresh()));
    }

    #[Test]
    public function a_manager_may_approve_a_smaller_quantity_than_proposed(): void
    {
        $proposal = $this->raiseProposal();

        $this->planner()->approve($proposal, $this->userWithRole('store_manager', (int) $this->store->id), 7);

        $this->assertSame(7, $proposal->fresh()->quantity);
    }

    #[Test]
    public function rejection_cancels_the_proposal_with_its_reason(): void
    {
        $proposal = $this->raiseProposal();
        $manager = $this->userWithRole('store_manager', (int) $this->store->id);

        $this->assertTrue($this->planner()->reject($proposal, $manager, 'No shelf space this week.'));

        $proposal->refresh();

        $this->assertSame(Transfer::APPROVAL_REJECTED, $proposal->approval_state);
        $this->assertSame('cancelled', $proposal->status);
        $this->assertSame('No shelf space this week.', $proposal->rejection_reason);
        $this->assertSame(0, Transfer::query()->awaitingApproval()->count());
    }

    #[Test]
    public function a_ruling_cannot_be_made_twice(): void
    {
        $proposal = $this->raiseProposal();
        $manager = $this->userWithRole('store_manager', (int) $this->store->id);

        $this->assertTrue($this->planner()->approve($proposal, $manager, null));
        $this->assertFalse($this->planner()->approve($proposal->fresh(), $manager, null));
    }

    #[Test]
    public function only_a_manager_of_the_destination_may_approve(): void
    {
        $proposal = $this->raiseProposal();

        $outsider = $this->userWithRole('seller', (int) Store::factory()->create()->id);
        $this->assertFalse($outsider->can('approve', $proposal));

        $sellerHere = $this->userWithRole('seller', (int) $this->store->id);
        $this->assertFalse(
            $sellerHere->can('approve', $proposal),
            'Working at the destination is not the same as being entitled to approve for it.',
        );

        $sellerHere->givePermissionTo('approve replenishment transfers');
        $this->assertTrue($sellerHere->fresh()->can('approve', $proposal));

        $this->assertTrue($this->userWithRole('admin')->can('approve', $proposal));
    }

    /* ---------------------------------------------------------------------
     | Domain boundaries
     |--------------------------------------------------------------------*/

    #[Test]
    public function a_warehouse_to_warehouse_shortfall_is_reported_as_freight_not_proposed_as_a_transfer(): void
    {
        $remote = Store::factory()->create([
            'name' => 'Kality Depot',
            'type' => Store::TYPE_REMOTE_WAREHOUSE,
        ]);

        $hubVariant = StoreVariant::factory()->create([
            'store_id' => $remote->id,
            'item_variant_id' => $this->variant->id,
        ]);

        // The hub holds stock; the remote warehouse is empty and has a floor.
        $this->stockAt(Store::class, (int) $this->hub->id, 500);
        $this->capacity()->setBand($hubVariant, Store::class, (int) $remote->id, 50, 200);

        $outcome = $this->planner()->sweep([(int) $hubVariant->id]);

        $this->assertCount(0, $outcome['created'], 'Freight between warehouses must not be written as a transfer.');
        $this->assertCount(1, $outcome['shipment_candidates']);
        $this->assertSame(0, Transfer::query()->count());
    }

    #[Test]
    public function the_transfer_domain_refuses_a_leg_between_two_warehouses(): void
    {
        $this->expectException(MovementDomainException::class);

        app(TransferWorkflowService::class)->create(
            variantId: (int) $this->variant->id,
            fromStoreId: (int) $this->hub->id,
            toStoreId: (int) Store::factory()->create(['type' => Store::TYPE_CENTRAL_WAREHOUSE])->id,
            quantity: 10,
        );
    }

    #[Test]
    public function a_shipment_runs_from_a_main_hub_to_a_store_and_nowhere_else(): void
    {
        $domain = app(MovementDomainService::class);
        $remote = Store::factory()->create(['type' => Store::TYPE_REMOTE_WAREHOUSE]);
        $otherHub = Store::factory()->create(['type' => Store::TYPE_CENTRAL_WAREHOUSE]);

        // Hub → store and hub → remote hub are freight.
        $domain->assertShipmentLeg($this->hub, $this->store);
        $domain->assertShipmentLeg($this->hub, $remote);

        // A store never sends a shipment, and hubs do not ship to each other.
        foreach ([[$this->store, $this->hub], [$remote, $this->store], [$this->hub, $otherHub]] as [$from, $to]) {
            try {
                $domain->assertShipmentLeg($from, $to);
                $this->fail("{$from->name} → {$to->name} must not be a shipment.");
            } catch (MovementDomainException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    /* ---------------------------------------------------------------------
     | Warehouse management
     |--------------------------------------------------------------------*/

    #[Test]
    public function a_warehouse_takes_any_number_of_managers_and_only_they_may_oversee_it(): void
    {
        $warehouse = \App\Models\Inventory\Warehouse::create([
            'name' => 'Remote Unit 1',
            'store_id' => $this->store->id,
            'status' => 'active',
        ]);

        $first = $this->userWithRole('store_manager');
        $second = $this->userWithRole('stock_keeper');
        $third = $this->userWithRole('seller');

        $warehouse->syncManagers([$first->id, $second->id]);

        $this->assertTrue($warehouse->isManagedBy($first));
        $this->assertTrue($warehouse->isManagedBy($second));
        $this->assertFalse($warehouse->isManagedBy($third));
        $this->assertSame($first->id, $warehouse->primaryManager()?->id);

        $this->assertTrue($first->can('oversee', $warehouse));
        $this->assertFalse($third->can('oversee', $warehouse));
        $this->assertTrue($this->userWithRole('admin')->can('oversee', $warehouse));

        // Appointing is an admin act, even for a sitting manager.
        $this->assertFalse($first->can('assignManagers', $warehouse));

        // No ceiling any more: a third manager is simply a manager.
        $warehouse->syncManagers([$first->id, $second->id, $third->id]);
        $this->assertTrue($warehouse->isManagedBy($third));
    }

    /** A shelf below its floor, with the back room able to serve it. */
    private function raiseProposal(): Transfer
    {
        $this->stockAt(Store::class, (int) $this->store->id, 100);
        $this->capacity()->setBand($this->storeVariant, ItemInventoryLocation::class, (int) $this->shelf()->id, 5, 20);

        $outcome = $this->planner()->sweep([(int) $this->storeVariant->id]);

        return $outcome['created'][0];
    }
}
