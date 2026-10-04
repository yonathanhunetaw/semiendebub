<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Exceptions\MovementDomainException;
use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Services\Inventory\RefillEngine;
use App\Services\Inventory\ShelfMatrix;
use App\Services\Inventory\StockLocationTree;
use App\Services\StockService;
use App\Services\TransferWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Where a shelf bin's refill comes from: the store floor first (straight to
 * the shelving list), then the item's route — Remote Hub, shipment — for what
 * the floor cannot give, never asking twice for what is already on its way.
 *
 * Bic pens throughout: packets of 10 and loose pieces. The bin is banded in
 * packets: max 5 (50 pieces), refill at 2, crit low at 1.
 */
class ShelfRefillEngineTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $shelf;

    private StockLocation $floor;

    private StockLocation $remote;

    private Item $pen;

    private ItemVariant $packet;

    private ItemVariant $piece;

    private RefillEngine $engine;

    private StockService $stock;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $this->floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        $this->remote = app(StockLocationTree::class)->addRemoteHub($this->store);

        $this->pen = Item::factory()->create(['product_name' => 'Bic Pen', 'status' => 'active']);
        $packetType = ItemPackagingType::factory()->create(['name' => 'Packet']);
        $pieceType = ItemPackagingType::factory()->create(['name' => 'Piece']);
        DB::table('item_packaging_type_item')->insert([
            ['item_id' => $this->pen->id, 'item_packaging_type_id' => $packetType->id, 'quantity' => 10],
            ['item_id' => $this->pen->id, 'item_packaging_type_id' => $pieceType->id, 'quantity' => 1],
        ]);
        $this->packet = ItemVariant::factory()->create(['item_id' => $this->pen->id, 'item_packaging_type_id' => $packetType->id]);
        $this->piece = ItemVariant::factory()->create(['item_id' => $this->pen->id, 'item_packaging_type_id' => $pieceType->id]);

        app(ShelfMatrix::class)->setBand($this->shelf, $this->pen, $packetType->id, 5, 2, 1);

        $this->engine = app(RefillEngine::class);
        $this->stock = app(StockService::class);
    }

    #[Test]
    public function the_floor_gives_what_it_has_and_the_rest_goes_to_the_next_source(): void
    {
        // Shelf empty → 50 short. Floor has 2 packets, the Remote Hub 10.
        $this->stock->receive($this->packet->id, $this->floor, 2);
        $this->stock->receive($this->packet->id, $this->remote, 10);

        $outcome = $this->engine->raise($this->shelf, $this->pen);

        $this->assertSame('raised', $outcome['result']);
        $this->assertSame(50, $outcome['need_pieces']);
        $this->assertTrue($outcome['urgent']);

        // 20 straight onto the shelving list: a floor → shelf transfer, no approval, no courier.
        $floorLeg = RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_FLOOR)->sole();
        $this->assertSame(RefillRequest::STATUS_IN_PROGRESS, $floorLeg->status);
        $transfer = Transfer::query()->sole();
        $this->assertSame([$this->packet->id, 2], [(int) $transfer->item_variant_id, (int) $transfer->quantity]);
        $this->assertSame((int) $transfer->id, $floorLeg->transfer_id);
        $this->assertFalse($transfer->awaitsApproval());
        $this->assertFalse(app(TransferWorkflowService::class)->needsCourier($transfer));

        // 30 from the Remote Hub, waiting for the store manager.
        $remoteLeg = RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_REMOTE_HUB)->sole();
        $this->assertSame([RefillRequest::STATUS_PENDING, 3], [$remoteLeg->status, $remoteLeg->quantity]);

        $this->assertSame(0, RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_SHIPMENT)->count());
    }

    #[Test]
    public function what_neither_the_floor_nor_the_remote_hub_has_goes_on_a_shipment_line(): void
    {
        $this->stock->receive($this->packet->id, $this->floor, 1);
        $this->stock->receive($this->packet->id, $this->remote, 1);

        $this->engine->raise($this->shelf, $this->pen);

        $this->assertSame(
            [ItemRefillRoute::SOURCE_FLOOR => 1, ItemRefillRoute::SOURCE_REMOTE_HUB => 1, ItemRefillRoute::SOURCE_SHIPMENT => 3],
            RefillRequest::query()->orderBy('id')->pluck('quantity', 'source')->map(fn ($q): int => (int) $q)->all(),
        );

        $shipment = RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_SHIPMENT)->sole();
        $this->assertSame(RefillRequest::STATUS_PENDING, $shipment->status);
        $this->assertNull($shipment->shipment_id, 'No hub until the shipment is built.');
    }

    #[Test]
    public function the_items_route_decides_which_sources_are_used(): void
    {
        // Pens are never kept at the Remote Hub for this store: floor, then shipment.
        $this->engine->setRoute($this->store->id, $this->pen, [ItemRefillRoute::SOURCE_FLOOR, ItemRefillRoute::SOURCE_SHIPMENT]);
        $this->stock->receive($this->packet->id, $this->remote, 10);

        $this->engine->raise($this->shelf, $this->pen);

        $this->assertSame(0, RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_REMOTE_HUB)->count());
        $this->assertSame(5, RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_SHIPMENT)->sole()->quantity);
    }

    #[Test]
    public function a_route_must_name_known_sources_once_each(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->engine->setRoute($this->store->id, $this->pen, [ItemRefillRoute::SOURCE_FLOOR, ItemRefillRoute::SOURCE_FLOOR]);
    }

    #[Test]
    public function a_second_look_does_not_ask_again_for_what_is_already_on_its_way(): void
    {
        $this->stock->receive($this->packet->id, $this->floor, 2);

        $this->engine->raise($this->shelf, $this->pen);
        $legs = RefillRequest::query()->count();
        $transfers = Transfer::query()->count();

        $again = $this->engine->raise($this->shelf, $this->pen);

        $this->assertSame('covered', $again['result']);
        $this->assertSame($legs, RefillRequest::query()->count());
        $this->assertSame($transfers, Transfer::query()->count());
    }

    #[Test]
    public function a_new_need_asks_only_for_the_extra_and_joins_the_line_awaiting_approval(): void
    {
        // Shelf at its refill line: 2 packets = 20 → 30 short, all by shipment.
        $this->stock->receive($this->packet->id, $this->shelf, 2);
        $this->engine->raise($this->shelf, $this->pen);
        $line = RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_SHIPMENT)->sole();
        $this->assertSame(3, $line->quantity);
        $this->assertFalse($line->urgent);

        // Two packets sell: now 50 short, 30 already asked for → 20 more, same line.
        $this->stock->adjust($this->packet->id, $this->shelf, -2);
        $this->engine->raise($this->shelf, $this->pen);

        $line->refresh();
        $this->assertSame(1, RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_SHIPMENT)->count());
        $this->assertSame(5, $line->quantity);
        $this->assertTrue($line->urgent, 'At crit low the line becomes urgent.');
    }

    #[Test]
    public function an_approved_line_is_not_grown_behind_the_managers_back(): void
    {
        $this->stock->receive($this->packet->id, $this->shelf, 2);
        $this->engine->raise($this->shelf, $this->pen);
        // On a manifest now: no longer a suggestion the engine may grow.
        RefillRequest::query()->update(['status' => RefillRequest::STATUS_IN_PROGRESS]);

        $this->stock->adjust($this->packet->id, $this->shelf, -2);
        $this->engine->raise($this->shelf, $this->pen);

        $lines = RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_SHIPMENT)->orderBy('id')->get();
        $this->assertSame([3, 2], $lines->pluck('quantity')->map(fn ($q): int => (int) $q)->all());
        $this->assertSame([RefillRequest::STATUS_IN_PROGRESS, RefillRequest::STATUS_PENDING], $lines->pluck('status')->all());
    }

    #[Test]
    public function the_remote_hub_is_not_promised_twice(): void
    {
        // The hub has 3 packets. The first need claims them all; once the
        // shelf drops further, the extra has to come by shipment.
        // Hub first: stocking the shelf at its refill line raises the refill
        // on its own (ShelfRefillObserver).
        $this->stock->receive($this->packet->id, $this->remote, 3);
        $this->stock->receive($this->packet->id, $this->shelf, 2);
        $this->engine->raise($this->shelf, $this->pen);
        $this->assertSame(3, RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_REMOTE_HUB)->sole()->quantity);

        $this->stock->adjust($this->packet->id, $this->shelf, -2);
        $this->engine->raise($this->shelf, $this->pen);

        $this->assertSame(3, RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_REMOTE_HUB)->sole()->quantity);
        $this->assertSame(2, RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_SHIPMENT)->sole()->quantity);
    }

    #[Test]
    public function an_automatic_raise_waits_for_the_refill_line_but_a_stock_keeper_need_not(): void
    {
        $this->stock->receive($this->packet->id, $this->shelf, 3);   // 30 > refill line of 20

        $this->assertSame('not_needed', $this->engine->raise($this->shelf, $this->pen)['result']);
        $this->assertSame(0, RefillRequest::query()->count());

        $manual = $this->engine->raise($this->shelf, $this->pen, RefillRequest::ORIGIN_MANUAL);

        $this->assertSame('raised', $manual['result']);
        $this->assertSame(RefillRequest::ORIGIN_MANUAL, RefillRequest::query()->sole()->origin);
    }

    #[Test]
    public function a_stock_keeper_can_skip_a_floor_whose_count_is_wrong(): void
    {
        $this->stock->receive($this->packet->id, $this->floor, 10);
        $this->stock->receive($this->packet->id, $this->remote, 10);

        $this->engine->raise($this->shelf, $this->pen, RefillRequest::ORIGIN_MANUAL, null, ItemRefillRoute::SOURCE_REMOTE_HUB);

        $this->assertSame(0, Transfer::query()->count());
        $this->assertSame(5, RefillRequest::query()->where('source', ItemRefillRoute::SOURCE_REMOTE_HUB)->sole()->quantity);
    }

    #[Test]
    public function skipping_to_a_source_off_the_route_is_refused(): void
    {
        $this->engine->setRoute($this->store->id, $this->pen, [ItemRefillRoute::SOURCE_FLOOR, ItemRefillRoute::SOURCE_SHIPMENT]);

        $this->expectException(InvalidArgumentException::class);

        $this->engine->raise($this->shelf, $this->pen, RefillRequest::ORIGIN_MANUAL, null, ItemRefillRoute::SOURCE_REMOTE_HUB);
    }

    #[Test]
    public function less_than_a_pack_is_not_sent_for_from_afar(): void
    {
        // 45 on the shelf: 5 pieces short — shelved loose from the floor if it
        // has them, never escalated as a fraction of a packet.
        $this->stock->receive($this->packet->id, $this->shelf, 4);
        $this->stock->receive($this->piece->id, $this->shelf, 5);

        $outcome = $this->engine->raise($this->shelf, $this->pen, RefillRequest::ORIGIN_MANUAL);

        $this->assertSame('uncovered', $outcome['result']);
        $this->assertSame(5, $outcome['uncovered_pieces']);
        $this->assertSame(0, RefillRequest::query()->count());

        $this->stock->receive($this->piece->id, $this->floor, 20);
        $this->engine->raise($this->shelf, $this->pen, RefillRequest::ORIGIN_MANUAL);

        $this->assertSame([$this->piece->id, 5], [(int) Transfer::query()->sole()->item_variant_id, (int) Transfer::query()->sole()->quantity]);
    }

    #[Test]
    public function an_item_with_no_bin_cannot_be_refilled(): void
    {
        $stapler = Item::factory()->create(['product_name' => 'Stapler', 'status' => 'active']);

        $this->expectException(InvalidArgumentException::class);

        $this->engine->raise($this->shelf, $stapler, RefillRequest::ORIGIN_MANUAL);
    }

    #[Test]
    public function nothing_goes_onto_a_shelf_for_an_item_with_no_bin(): void
    {
        $stapler = Item::factory()->create(['product_name' => 'Stapler', 'status' => 'active']);
        $staplerVariant = ItemVariant::factory()->create(['item_id' => $stapler->id]);
        $this->stock->receive($staplerVariant->id, $this->floor, 5);
        $workflow = app(TransferWorkflowService::class);

        // Onto the floor is fine: the planogram is only the shelf's.
        $workflow->create(
            variantId: $staplerVariant->id, fromStoreId: null, toStoreId: null, quantity: 1,
            sourceLocationType: StockLocation::class, sourceLocationId: $this->remote->id,
            destinationLocationType: StockLocation::class, destinationLocationId: $this->floor->id,
        );

        $this->expectException(MovementDomainException::class);
        $this->expectExceptionMessage('Stapler has no bin');

        $workflow->create(
            variantId: $staplerVariant->id, fromStoreId: null, toStoreId: null, quantity: 1,
            sourceLocationType: StockLocation::class, sourceLocationId: $this->floor->id,
            destinationLocationType: StockLocation::class, destinationLocationId: $this->shelf->id,
        );
    }

    #[Test]
    public function a_bin_with_a_band_takes_a_transfer_from_the_floor(): void
    {
        $this->stock->receive($this->packet->id, $this->floor, 5);

        $transfer = app(TransferWorkflowService::class)->create(
            variantId: $this->packet->id, fromStoreId: null, toStoreId: null, quantity: 1,
            sourceLocationType: StockLocation::class, sourceLocationId: $this->floor->id,
            destinationLocationType: StockLocation::class, destinationLocationId: $this->shelf->id,
        );

        $this->assertSame(1, (int) $transfer->quantity);
    }
}
