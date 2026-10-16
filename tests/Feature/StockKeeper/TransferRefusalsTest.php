<?php

declare(strict_types=1);

namespace Tests\Feature\StockKeeper;

use App\Exceptions\MovementDomainException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Services\StockService;
use App\Services\TransferWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A transfer's refusals on the stock keeper app and in the workflow: no ends,
 * a non-courier as carrier, an unapproved proposal, a bad arrival count, and
 * steps taken out of order.
 */
class TransferRefusalsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $floor;

    private StockLocation $shelf;

    private ItemVariant $variant;

    private User $keeper;

    private TransferWorkflowService $workflow;

    protected function setUp(): void
    {
        parent::setUp();

        $this->workflow = app(TransferWorkflowService::class);
        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $this->variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]);
        app(StockService::class)->receive($this->variant->id, $this->floor, 20);
        // Planogram first: the item has a bin on the shelf.
        \App\Models\Inventory\ShelfItemBand::query()->create(['stock_location_id' => $this->shelf->id, 'item_id' => $this->variant->item_id, 'max_units' => 100, 'refill_units' => 10, 'critical_units' => 5]);

        $this->keeper = User::factory()->create(['role' => 'stock_keeper', 'store_id' => $this->store->id]);
        $this->keeper->assignRole('stock_keeper');
        $this->keeper->refresh();

        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.'.config('app.system_domain')]);
        $this->actingAs($this->keeper);
    }

    private function floorToShelf(int $quantity = 5): Transfer
    {
        return $this->workflow->create(
            variantId: $this->variant->id, fromStoreId: null, toStoreId: null, quantity: $quantity, initiatedBy: $this->keeper->id,
            sourceLocationType: StockLocation::class, sourceLocationId: (int) $this->floor->id,
            destinationLocationType: StockLocation::class, destinationLocationId: (int) $this->shelf->id,
        );
    }

    #[Test]
    public function a_transfer_needs_both_ends(): void
    {
        $this->expectExceptionMessage('A transfer needs an origin and a destination.');

        $this->workflow->create(variantId: $this->variant->id, fromStoreId: null, toStoreId: null, quantity: 1);
    }

    #[Test]
    public function only_a_delivery_courier_can_carry_a_transfer(): void
    {
        $this->expectException(MovementDomainException::class);
        $this->expectExceptionMessage('Only a delivery courier can carry a transfer.');

        $this->workflow->assignCourier($this->floorToShelf(), $this->keeper);
    }

    #[Test]
    public function an_unapproved_proposal_cannot_be_dispatched_from_the_keeper_app(): void
    {
        $proposal = $this->floorToShelf();
        $proposal->forceFill(['origin' => Transfer::ORIGIN_AUTO, 'approval_state' => Transfer::APPROVAL_PENDING])->save();

        $this->post(route('stock_keeper.transfers.dispatch', $proposal))
            ->assertSessionHas('error', 'This is an automated replenishment proposal. A store manager must approve it before it can be dispatched.');
        $this->assertSame('pending', $proposal->fresh()->status);
    }

    #[Test]
    public function steps_out_of_order_are_refused_with_a_reason(): void
    {
        $transfer = $this->floorToShelf();

        $this->post(route('stock_keeper.transfers.complete', $transfer))
            ->assertSessionHas('error', 'Only a transfer in transit can be completed.');

        $this->post(route('stock_keeper.transfers.dispatch', $transfer))->assertSessionHas('success');
        $this->post(route('stock_keeper.transfers.dispatch', $transfer->fresh()))
            ->assertSessionHas('error', 'Only a queued transfer can be dispatched.');
    }

    #[Test]
    public function an_arrival_count_with_more_damaged_than_arrived_is_refused(): void
    {
        $transfer = $this->floorToShelf();
        $this->post(route('stock_keeper.transfers.dispatch', $transfer))->assertSessionHas('success');

        $this->post(route('stock_keeper.transfers.complete', $transfer->fresh()), ['received' => 3, 'damaged' => 4])
            ->assertSessionHasErrors('damaged');
        $this->assertSame('in_transit', $transfer->fresh()->status);

        // The workflow refuses it too, for callers that skip the form.
        try {
            $this->workflow->markCompleted($transfer->fresh(), $this->keeper, 3, 4);
            $this->fail('expected the bad count to be refused');
        } catch (\InvalidArgumentException $e) {
            $this->assertStringContainsString('Damaged units are part of what arrived', $e->getMessage());
        }
        $this->assertSame('in_transit', $transfer->fresh()->status);

        $this->post(route('stock_keeper.transfers.complete', $transfer->fresh()), ['received' => 5, 'damaged' => 1])
            ->assertSessionHas('success');
        $this->assertSame('completed', $transfer->fresh()->status);
    }

    #[Test]
    public function a_completed_or_cancelled_transfer_cannot_be_cancelled_again(): void
    {
        $transfer = $this->floorToShelf();

        $this->assertTrue($this->workflow->cancel($transfer, $this->keeper->id));
        $this->assertFalse($this->workflow->cancel($transfer->fresh(), $this->keeper->id));
        $this->assertFalse($this->workflow->markDispatched($transfer->fresh(), $this->keeper));
    }
}
