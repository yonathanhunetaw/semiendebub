<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Exceptions\InsufficientStockException;
use App\Models\Auth\User;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\StockReservation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\CheckoutService;
use App\Services\Inventory\ItemStockReader;
use App\Services\Inventory\LocationCapacityService;
use App\Services\Inventory\StockLocationTree;
use App\Services\StockKeeperService;
use App\Services\StockService;
use App\Services\TransferWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * STOCK_PLAN.md phase 4: writers and readers cut over to the location tree.
 *
 * Acceptance tests 1 (conservation), 2 (no oversell at checkout), 3 (refused,
 * never clamped) and 4 (every screen reads one figure), plus the two things
 * the cutover exists for: moving stock onto a Store Shelf and into a Remote
 * Hub from the stock keeper's own screens.
 */
class StockCutoverTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private ItemVariant $variant;

    private StoreVariant $storeVariant;

    private StockLocation $shelf;

    private StockLocation $floor;

    private StockService $stock;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['name' => 'stock_keeper']);

        $this->stock = app(StockService::class);
        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->shelf = $this->leaf(StockLocation::KIND_SHELF);
        $this->floor = $this->leaf(StockLocation::KIND_BACKROOM);

        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $this->storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_id' => $item->id,
            'item_variant_id' => $this->variant->id,
            'active' => true,
        ]);

        // Planogram first: the item has a bin on the shelf.
        ShelfItemBand::query()->create([
            'stock_location_id' => $this->shelf->id,
            'item_id' => $item->id,
            'max_units' => 100,
            'refill_units' => 10,
            'critical_units' => 5,
        ]);
    }

    #[Test]
    public function a_stock_keeper_moves_stock_from_the_store_floor_onto_the_store_shelf(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 40);
        $keeper = $this->keeper();

        $this->asKeeper($keeper)
            ->post(route('stock_keeper.transfers.store'), [
                'item_variant_id' => $this->variant->id,
                'quantity' => 12,
                'source_location_type' => StockLocation::class,
                'source_location_id' => $this->floor->id,
                'destination_location_type' => StockLocation::class,
                'destination_location_id' => $this->shelf->id,
            ])
            ->assertSessionHasNoErrors();

        $transfer = Transfer::query()->sole();

        $this->asKeeper($keeper)->post(route('stock_keeper.transfers.dispatch', $transfer))->assertSessionMissing('error');
        $this->asKeeper($keeper)->post(route('stock_keeper.transfers.complete', $transfer))->assertSessionMissing('error');

        $this->assertSame([28, 12], [$this->quantityAt($this->floor), $this->quantityAt($this->shelf)]);
        // The store's total did not move: the units only changed place.
        $this->assertSame(40, $this->stock->onHandAtStore($this->variant->id, $this->store->id));
        $this->assertSame(TransferWorkflowService::STATUS_COMPLETED, $transfer->fresh()->status);
    }

    #[Test]
    public function a_stock_keeper_receives_straight_into_the_remote_hub(): void
    {
        $remote = app(StockLocationTree::class)->addRemoteHub($this->store);

        $this->asKeeper($this->keeper())
            ->post(route('stock_keeper.inventory.receive'), [
                'item_variant_id' => $this->variant->id,
                'location_type' => StockLocation::class,
                'location_id' => $remote->id,
                'quantity' => 25,
            ])
            ->assertSessionHasNoErrors();

        $this->assertSame(25, $this->quantityAt($remote));
        // A Remote Hub is its own tier, not stock at the counter.
        $this->assertSame(0, $this->stock->onHandAtStore($this->variant->id, $this->store->id));
    }

    #[Test]
    public function a_short_origin_refuses_the_dispatch_instead_of_clamping_it(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 5);

        $transfer = app(TransferWorkflowService::class)->create(
            variantId: $this->variant->id,
            fromStoreId: null,
            toStoreId: null,
            quantity: 9,
            sourceLocationType: StockLocation::class,
            sourceLocationId: $this->floor->id,
            destinationLocationType: StockLocation::class,
            destinationLocationId: $this->shelf->id,
        );

        try {
            app(TransferWorkflowService::class)->markDispatched($transfer);
            $this->fail('A transfer was dispatched from an origin that could not cover it.');
        } catch (InsufficientStockException) {
        }

        $this->assertSame(5, $this->quantityAt($this->floor));
        $this->assertSame(TransferWorkflowService::STATUS_PENDING, $transfer->fresh()->status);
    }

    #[Test]
    public function transfers_conserve_stock_through_dispatch_cancel_and_completion(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 30);
        $workflow = app(TransferWorkflowService::class);
        $raise = fn (int $qty): Transfer => $workflow->create(
            variantId: $this->variant->id,
            fromStoreId: null,
            toStoreId: null,
            quantity: $qty,
            sourceLocationType: StockLocation::class,
            sourceLocationId: $this->floor->id,
            destinationLocationType: StockLocation::class,
            destinationLocationId: $this->shelf->id,
        );

        $cancelled = $raise(10);
        $workflow->markDispatched($cancelled);
        $this->assertSame(20, $this->onShelves(), 'In transit is off every shelf…');
        $this->assertSame(10, $this->stock->inCustody($this->variant->id), '…and in Delivery\'s custody.');
        $this->assertSame(30, $this->networkTotal());
        $workflow->cancel($cancelled);
        $this->assertSame(30, $this->networkTotal());
        $this->assertSame(0, $this->stock->inCustody($this->variant->id));

        $completed = $raise(10);
        $workflow->markDispatched($completed);
        $workflow->markCompleted($completed);

        $this->assertSame(30, $this->networkTotal());
        $this->assertFalse($workflow->markCompleted($completed->fresh()), 'Completing twice must not land the stock twice.');
        $this->assertSame(30, $this->networkTotal());
    }

    #[Test]
    public function two_checkouts_cannot_both_sell_the_last_unit(): void
    {
        $this->stock->receive($this->variant->id, $this->floor, 1);

        app(CheckoutService::class)->checkout($this->cart(), ['payment_method' => 'cash']);

        try {
            app(CheckoutService::class)->checkout($this->cart(), ['payment_method' => 'cash']);
            $this->fail('The last unit was sold twice.');
        } catch (InsufficientStockException) {
        }

        $this->assertSame(1, StockReservation::query()->open()->count());
        $this->assertSame(0, $this->stock->availableAtStore($this->variant->id, $this->store->id));
    }

    #[Test]
    public function every_screen_reads_one_figure_for_the_store(): void
    {
        // 40 on the floor and 7 on the shelf: the store holds 47.
        $this->stock->receive($this->variant->id, $this->floor, 40);
        $this->stock->receive($this->variant->id, $this->shelf, 7);

        $storeNode = StockLocation::query()->legacy(Store::class, $this->store->id)->sole();
        $keeperRow = collect(app(StockKeeperService::class)->locations())->firstWhere('id', $storeNode->id);

        $figures = [
            'admin / seller batch' => app(StockService::class)->getBatchStock([$this->storeVariant->id])[$this->storeVariant->id],
            'store variant' => $this->storeVariant->fresh()->current_stock,
            'capacity / pick & pack' => app(LocationCapacityService::class)->onHand($this->variant->id, Store::class, $this->store->id),
            'stock keeper ledger' => app(ItemStockReader::class)->metrics(Store::class, $this->store->id)['units_on_hand'],
            'stock keeper location list' => $keeperRow['units'],
            'store breakdown' => app(StockService::class)->locationBreakdown([$this->variant->id], $this->store->id)[$this->variant->id]['store_total'],
            'gateway' => $this->stock->onHandAtStore($this->variant->id, $this->store->id),
        ];

        $this->assertSame(array_fill_keys(array_keys($figures), 47), $figures);
    }

    #[Test]
    public function the_transfer_screen_offers_every_shelf_floor_and_hub(): void
    {
        $remote = app(StockLocationTree::class)->addRemoteHub($this->store);

        $this->asKeeper($this->keeper())
            ->get(route('stock_keeper.transfers.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('StockKeeper/Transfers/index')
                ->where('locations', fn ($locations) => collect($locations)->pluck('id')->sort()->values()->all()
                    === StockLocation::query()->orderBy('id')->pluck('id')->all())
                ->where('locations', fn ($locations) => collect($locations)->contains(fn ($l) => $l['id'] === $remote->id && $l['kind'] === 'remote_hub')));
    }

    private function leaf(string $kind): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->store->id)->where('kind', $kind)->sole();
    }

    private function quantityAt(StockLocation $leaf): int
    {
        return (int) ItemStock::query()
            ->where('item_variant_id', $this->variant->id)
            ->where('stock_location_id', $leaf->id)
            ->value('quantity');
    }

    /** Everything except Delivery's custody. */
    private function onShelves(): int
    {
        return $this->networkTotal() - $this->stock->inCustody($this->variant->id);
    }

    private function networkTotal(): int
    {
        return (int) ItemStock::query()->where('item_variant_id', $this->variant->id)->sum('quantity');
    }

    private function keeper(): User
    {
        $user = User::factory()->create(['role' => 'stock_keeper']);
        $user->assignRole('stock_keeper');

        return $user->refresh();
    }

    private function asKeeper(User $user): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.'.config('app.system_domain')]);
        $this->actingAs($user, 'web');

        return $this;
    }

    private function cart(): Cart
    {
        $cart = Cart::create(['store_id' => $this->store->id, 'status' => 'open']);
        $cart->variants()->attach($this->variant->id, ['quantity' => 1, 'price' => 100, 'store_id' => $this->store->id]);

        return $cart;
    }
}
