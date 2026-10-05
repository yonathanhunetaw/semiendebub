<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\LocationCapacityService;
use App\Services\Inventory\ReplenishmentProposalService;
use App\Services\Inventory\StockLocationTree;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Admin → Transfers (cancel / complete) and the replenishment approvals queue,
 * plus the retired replenish wizard that now redirects to the shipment board.
 */
class AdminTransferReplenishmentTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Store $store;

    private StoreVariant $storeVariant;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'delivery', 'store_manager', 'seller'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }
        Permission::firstOrCreate(['name' => 'approve replenishment transfers']);

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $this->storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $this->variant->id,
        ]);

        ShelfItemBand::query()->create([
            'stock_location_id' => StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole()->id,
            'item_id' => $item->id,
            'max_units' => 100,
            'refill_units' => 10,
            'critical_units' => 5,
        ]);

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->admin);
    }

    private function ledger(StockLocation $location): int
    {
        return (int) ItemStock::query()->where('stock_location_id', $location->id)->sum('quantity');
    }

    /** A pending remote-hub → floor transfer of 8, with the courier already assigned. */
    private function transfer(): array
    {
        $remote = app(StockLocationTree::class)->addRemoteHub($this->store);
        $floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        app(StockService::class)->receive($this->variant->id, $remote, 20);

        $this->post(route('admin.inventory.transfers.store'), [
            'item_variant_id' => $this->variant->id,
            'quantity' => 8,
            'source_location_type' => StockLocation::class,
            'source_location_id' => $remote->id,
            'destination_location_type' => StockLocation::class,
            'destination_location_id' => $floor->id,
        ])->assertSessionHasNoErrors();

        return [Transfer::query()->latest('id')->firstOrFail(), $remote, $floor];
    }

    private function courier(): User
    {
        $courier = User::factory()->create(['role' => 'delivery']);
        $courier->assignRole('delivery');

        return $courier;
    }

    // ---- Transfers ---------------------------------------------------------

    #[Test]
    public function the_transfer_board_lists_active_transfers(): void
    {
        $this->transfer();

        $this->get(route('admin.inventory.transfers'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Inventory/Transfers/index')
                ->where('pendingCount', 1)
                ->where('transfers', fn ($rows) => count($rows) === 1));
    }

    #[Test]
    public function a_transfer_needs_a_variant_and_a_positive_quantity(): void
    {
        $this->post(route('admin.inventory.transfers.store'), [])->assertSessionHasErrors();
        $this->post(route('admin.inventory.transfers.store'), ['item_variant_id' => $this->variant->id, 'quantity' => 0])
            ->assertSessionHasErrors('quantity');

        $this->assertSame(0, Transfer::query()->count());
    }

    #[Test]
    public function cancelling_a_pending_transfer_moves_no_stock(): void
    {
        [$transfer, $remote] = $this->transfer();

        $this->patch(route('admin.inventory.transfers.cancel', $transfer))->assertSessionHas('success');

        $this->assertSame('cancelled', $transfer->fresh()->status);
        $this->assertSame(20, $this->ledger($remote));
    }

    #[Test]
    public function cancelling_in_transit_returns_the_stock_to_the_origin(): void
    {
        [$transfer, $remote] = $this->transfer();
        $this->patch(route('admin.inventory.transfers.courier', $transfer), ['courier_id' => $this->courier()->id]);
        $this->patch(route('admin.inventory.transfers.dispatch', $transfer))->assertSessionHas('success');
        $this->assertSame(12, $this->ledger($remote), 'stock has left the origin');

        $this->patch(route('admin.inventory.transfers.cancel', $transfer))->assertSessionHas('success');

        $this->assertSame('cancelled', $transfer->fresh()->status);
        $this->assertSame(20, $this->ledger($remote));
    }

    #[Test]
    public function a_completed_transfer_cannot_be_cancelled_and_a_cancelled_one_cannot_complete(): void
    {
        [$transfer, , $floor] = $this->transfer();
        $this->patch(route('admin.inventory.transfers.courier', $transfer), ['courier_id' => $this->courier()->id]);
        $this->patch(route('admin.inventory.transfers.complete', $transfer))->assertSessionHas('success');

        $this->patch(route('admin.inventory.transfers.cancel', $transfer))->assertSessionHas('error');
        $this->assertSame('completed', $transfer->fresh()->status);
        $this->assertSame(8, $this->ledger($floor));

        [$other] = $this->transfer();
        $this->patch(route('admin.inventory.transfers.cancel', $other));
        $this->patch(route('admin.inventory.transfers.complete', $other))->assertSessionHas('error');
        $this->assertSame(8, $this->ledger($floor), 'a cancelled transfer must not land');
    }

    #[Test]
    public function a_collected_transfer_keeps_its_courier(): void
    {
        [$transfer] = $this->transfer();
        $first = $this->courier();
        $second = $this->courier();

        $this->patch(route('admin.inventory.transfers.courier', $transfer), ['courier_id' => $first->id])->assertSessionHas('success');
        $this->patch(route('admin.inventory.transfers.dispatch', $transfer));
        $this->patch(route('admin.inventory.transfers.courier', $transfer), ['courier_id' => $second->id])->assertSessionHas('error');

        $this->assertSame($first->id, (int) $transfer->fresh()->courier_id);
    }

    #[Test]
    public function a_courier_must_be_a_real_user(): void
    {
        [$transfer] = $this->transfer();

        $this->patch(route('admin.inventory.transfers.courier', $transfer), ['courier_id' => 999999])
            ->assertSessionHasErrors('courier_id');
    }

    // ---- Replenishment approvals ------------------------------------------

    /** A shelf below its floor, with the back room able to serve it. */
    private function proposal(): Transfer
    {
        ItemStock::updateOrCreate(
            ['item_variant_id' => $this->variant->id, 'location_type' => Store::class, 'location_id' => $this->store->id],
            ['quantity' => 100, 'min_stock_level' => 0],
        );
        $shelf = $this->store->inventoryLocations()->shelves()->firstOrFail();
        app(LocationCapacityService::class)->setBand($this->storeVariant, ItemInventoryLocation::class, (int) $shelf->id, 5, 20);

        return app(ReplenishmentProposalService::class)->sweep([(int) $this->storeVariant->id])['created'][0];
    }

    private function manager(): User
    {
        $manager = User::factory()->create(['role' => 'store_manager', 'store_id' => $this->store->id]);
        $manager->assignRole('store_manager');

        return $manager->refresh();
    }

    #[Test]
    public function the_approvals_queue_lists_waiting_proposals(): void
    {
        $this->proposal();

        $this->get(route('admin.inventory.replenishment.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Inventory/Transfers/Proposals')
                ->where('counts.awaiting_approval', 1)
                ->where('can_approve', true));
    }

    #[Test]
    public function an_admin_approves_a_proposal_and_it_joins_the_active_list(): void
    {
        $proposal = $this->proposal();

        $this->post(route('admin.inventory.replenishment.approve', $proposal))->assertSessionHas('success');

        $this->assertSame(Transfer::APPROVAL_APPROVED, $proposal->fresh()->approval_state);
        $this->assertSame(1, Transfer::query()->active()->count());
    }

    #[Test]
    public function approval_may_lower_the_quantity(): void
    {
        $proposal = $this->proposal();

        $this->post(route('admin.inventory.replenishment.approve', $proposal), ['quantity' => 7])->assertSessionHas('success');

        $this->assertSame(7, $proposal->fresh()->quantity);
    }

    #[Test]
    public function approval_rejects_a_zero_quantity(): void
    {
        $proposal = $this->proposal();

        $this->post(route('admin.inventory.replenishment.approve', $proposal), ['quantity' => 0])->assertSessionHasErrors('quantity');

        $this->assertSame(Transfer::APPROVAL_PENDING, $proposal->fresh()->approval_state);
    }

    #[Test]
    public function a_proposal_cannot_be_ruled_on_twice(): void
    {
        $proposal = $this->proposal();
        $this->post(route('admin.inventory.replenishment.approve', $proposal));

        // The policy only admits a proposal that still awaits approval.
        $this->post(route('admin.inventory.replenishment.approve', $proposal))->assertForbidden();
        $this->post(route('admin.inventory.replenishment.reject', $proposal), ['reason' => 'Too late'])->assertForbidden();

        $this->assertSame(Transfer::APPROVAL_APPROVED, $proposal->fresh()->approval_state);
    }

    #[Test]
    public function rejecting_needs_a_reason_and_records_it(): void
    {
        $proposal = $this->proposal();

        $this->post(route('admin.inventory.replenishment.reject', $proposal), [])->assertSessionHasErrors('reason');
        $this->assertSame(Transfer::APPROVAL_PENDING, $proposal->fresh()->approval_state);

        $this->post(route('admin.inventory.replenishment.reject', $proposal), ['reason' => 'No shelf space this week.'])
            ->assertSessionHas('success');

        $proposal->refresh();
        $this->assertSame(Transfer::APPROVAL_REJECTED, $proposal->approval_state);
        $this->assertSame('No shelf space this week.', $proposal->rejection_reason);
    }

    #[Test]
    public function a_manager_of_the_destination_may_approve_but_an_outsider_may_not(): void
    {
        $proposal = $this->proposal();

        $outsider = User::factory()->create(['role' => 'seller', 'store_id' => Store::factory()->create()->id]);
        $outsider->assignRole('seller');
        $this->actingAs($outsider);
        $this->post(route('admin.inventory.replenishment.approve', $proposal))->assertForbidden();
        $this->assertSame(Transfer::APPROVAL_PENDING, $proposal->fresh()->approval_state);

        $this->actingAs($this->manager());
        $this->post(route('admin.inventory.replenishment.approve', $proposal))->assertSessionHas('success');
    }

    // ---- The retired replenish wizard -------------------------------------

    #[Test]
    public function every_old_replenish_address_lands_on_the_shipment_board(): void
    {
        $board = route('admin.inventory.shipments.index');

        $this->get(route('admin.inventory.replenish'))->assertRedirect($board);
        $this->get(route('admin.inventory.replenish.show', 1))->assertRedirect($board);
        $this->get(route('admin.inventory.replenish.review', 1))->assertRedirect($board);
        $this->get(route('admin.inventory.replenish.dispatched', 1))->assertRedirect($board);
        $this->post(route('admin.inventory.replenish.store'))->assertRedirect($board)->assertSessionHas('error');
        $this->post(route('admin.inventory.replenish.dispatch', 1))->assertRedirect($board)->assertSessionHas('error');
    }
}
