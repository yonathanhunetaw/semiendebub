<?php

declare(strict_types=1);

namespace Tests\Feature\Seller;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Services\StockService;
use App\Services\TransferWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The Store Shelf as bins: one item per bin across all its pack variants, a
 * band per item in one of its pack units, and a refill from the store floor.
 */
class ShelfBinMatrixTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $shelf;

    private StockLocation $floor;

    private Item $pen;

    private ItemVariant $packet;

    private ItemVariant $piece;

    private ItemPackagingType $packetType;

    private User $seller;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['name' => 'seller']);
        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $this->floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();

        // A Bic pen: packets of 10, and loose pieces.
        $this->pen = Item::factory()->create(['product_name' => 'Bic Pen', 'status' => 'active']);
        $this->packetType = ItemPackagingType::factory()->create(['name' => 'Packet']);
        $pieceType = ItemPackagingType::factory()->create(['name' => 'Piece']);
        DB::table('item_packaging_type_item')->insert([
            ['item_id' => $this->pen->id, 'item_packaging_type_id' => $this->packetType->id, 'quantity' => 10],
            ['item_id' => $this->pen->id, 'item_packaging_type_id' => $pieceType->id, 'quantity' => 1],
        ]);
        $this->packet = ItemVariant::factory()->create(['item_id' => $this->pen->id, 'item_packaging_type_id' => $this->packetType->id]);
        $this->piece = ItemVariant::factory()->create(['item_id' => $this->pen->id, 'item_packaging_type_id' => $pieceType->id]);

        $stock = app(StockService::class);
        $stock->receive($this->packet->id, $this->shelf, 4);   // 40 pieces
        $stock->receive($this->piece->id, $this->shelf, 5);    //  5 pieces
        $stock->receive($this->packet->id, $this->floor, 100);

        // The seller runs this shelf: its planogram is theirs to edit.
        $this->seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $this->seller->assignRole('seller');
        $this->shelf->syncManagers([$this->seller->id]);
    }

    #[Test]
    public function the_shelf_shows_one_bin_per_item_across_its_pack_variants(): void
    {
        $this->asSeller($this->seller)
            ->get(route('seller.locations.show', $this->shelf))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('canEditShelf', true)
                ->where('matrix.totals.items', 1)
                ->where('matrix.bins.0.coord', 'A1')
                ->where('matrix.bins.0.name', 'Bic Pen')
                ->where('matrix.bins.0.pieces', 45)
                ->where('matrix.bins.0.display', '4 Packets · 5 Pieces')
                ->where('matrix.bins.0.band', null));
    }

    #[Test]
    public function a_band_in_packets_sets_the_bins_status(): void
    {
        // Max 10 packets, refill at 5, critical at 2: 45 pieces = 4.5 packets → refill.
        $this->asSeller($this->seller)
            ->patch(route('seller.locations.bands.update', ['location' => $this->shelf, 'item' => $this->pen]), [
                'item_packaging_type_id' => $this->packetType->id, 'max' => 10, 'refill' => 5, 'critical' => 2,
            ])
            ->assertSessionHasNoErrors();

        $this->asSeller($this->seller)
            ->get(route('seller.locations.show', $this->shelf))
            ->assertInertia(fn ($page) => $page
                ->where('matrix.bins.0.status', 'refill')
                ->where('matrix.bins.0.in_unit', 4.5)
                ->where('matrix.bins.0.max_pieces', 100)
                ->where('matrix.totals.refill_queue', 1));

        // Lines out of order are refused.
        $this->asSeller($this->seller)
            ->patch(route('seller.locations.bands.update', ['location' => $this->shelf, 'item' => $this->pen]), [
                'item_packaging_type_id' => $this->packetType->id, 'max' => 10, 'refill' => 2, 'critical' => 5,
            ])
            ->assertSessionHasErrors('band');
    }

    #[Test]
    public function a_refill_brings_the_shortfall_out_from_the_store_floor(): void
    {
        $this->asSeller($this->seller)->patch(route('seller.locations.bands.update', ['location' => $this->shelf, 'item' => $this->pen]), [
            'item_packaging_type_id' => $this->packetType->id, 'max' => 10, 'refill' => 5, 'critical' => 2,
        ]);

        $this->asSeller($this->seller)
            ->post(route('seller.locations.bands.refill', ['location' => $this->shelf, 'item' => $this->pen]))
            ->assertSessionHas('success');

        // 100 − 45 = 55 pieces short → 5 whole packets, floor → shelf, no courier.
        $transfer = Transfer::query()->sole();
        $this->assertSame([$this->packet->id, 5], [(int) $transfer->item_variant_id, (int) $transfer->quantity]);
        $this->assertFalse(app(TransferWorkflowService::class)->needsCourier($transfer));

        app(TransferWorkflowService::class)->markDispatched($transfer);
        app(TransferWorkflowService::class)->markCompleted($transfer->fresh());

        $this->asSeller($this->seller)
            ->get(route('seller.locations.show', $this->shelf))
            ->assertInertia(fn ($page) => $page->where('matrix.bins.0.pieces', 95)->where('matrix.bins.0.status', 'ok'));
    }

    #[Test]
    public function another_stores_seller_cannot_change_this_shelf(): void
    {
        $outsider = User::factory()->create(['role' => 'seller', 'store_id' => Store::factory()->create()->id]);
        $outsider->assignRole('seller');

        $this->asSeller($outsider)
            ->patch(route('seller.locations.bands.update', ['location' => $this->shelf, 'item' => $this->pen]), ['max' => 10, 'refill' => 5, 'critical' => 2])
            ->assertForbidden();

        $this->asSeller($outsider)
            ->post(route('seller.locations.bands.refill', ['location' => $this->shelf, 'item' => $this->pen]))
            ->assertForbidden();
    }

    #[Test]
    public function a_seller_who_does_not_manage_the_shelf_sees_it_but_cannot_change_it(): void
    {
        $colleague = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $colleague->assignRole('seller');

        $this->asSeller($colleague)
            ->get(route('seller.locations.show', $this->shelf))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('canEditShelf', false)
                ->where('canRaiseRefill', false)
                ->where('matrix.bins.0.name', 'Bic Pen'));

        $this->asSeller($colleague)
            ->patch(route('seller.locations.bands.update', ['location' => $this->shelf, 'item' => $this->pen]), ['max' => 10, 'refill' => 5, 'critical' => 2])
            ->assertForbidden();

        $this->asSeller($colleague)
            ->delete(route('seller.locations.bands.destroy', ['location' => $this->shelf, 'item' => $this->pen]))
            ->assertForbidden();
    }

    #[Test]
    public function an_unmanaged_shelf_cannot_be_edited_by_its_stores_sellers(): void
    {
        $this->shelf->syncManagers([]);

        $this->asSeller($this->seller)
            ->patch(route('seller.locations.bands.update', ['location' => $this->shelf, 'item' => $this->pen]), ['max' => 10, 'refill' => 5, 'critical' => 2])
            ->assertForbidden();
    }

    #[Test]
    public function an_assigned_item_shows_as_an_empty_bin_and_removing_it_leaves_its_stock_unassigned(): void
    {
        $notebook = Item::factory()->create(['product_name' => 'Notebook', 'status' => 'active']);

        $this->asSeller($this->seller)
            ->patch(route('seller.locations.bands.update', ['location' => $this->shelf, 'item' => $notebook]), ['max' => 20, 'refill' => 8, 'critical' => 3])
            ->assertSessionHasNoErrors();

        // Banded first: the notebook's empty bin is A1, the unbanded pens follow.
        $this->asSeller($this->seller)
            ->get(route('seller.locations.show', $this->shelf))
            ->assertInertia(fn ($page) => $page
                ->where('matrix.totals.items', 2)
                ->where('matrix.totals.unassigned', 1)
                ->where('matrix.bins.0.name', 'Notebook')
                ->where('matrix.bins.0.status', 'empty')
                ->where('matrix.bins.0.assigned', true)
                ->where('matrix.bins.0.band.refill', 8)
                ->where('matrix.bins.1.name', 'Bic Pen')
                ->where('matrix.bins.1.assigned', false));

        $this->asSeller($this->seller)
            ->delete(route('seller.locations.bands.destroy', ['location' => $this->shelf, 'item' => $notebook]))
            ->assertSessionHas('success');

        $this->asSeller($this->seller)
            ->get(route('seller.locations.show', $this->shelf))
            ->assertInertia(fn ($page) => $page->where('matrix.totals.items', 1)->where('matrix.bins.0.name', 'Bic Pen'));
    }

    #[Test]
    public function a_manager_finds_items_to_assign_with_their_pack_units(): void
    {
        $notebook = Item::factory()->create(['product_name' => 'Notebook', 'status' => 'active']);
        $notebookVariant = ItemVariant::factory()->create(['item_id' => $notebook->id]);
        \App\Models\Store\StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $notebook->id, 'item_variant_id' => $notebookVariant->id]);
        \App\Models\Store\StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $this->pen->id, 'item_variant_id' => $this->packet->id]);

        // Pens already have a bin here once banded; only the notebook is offered then.
        $this->asSeller($this->seller)->patch(route('seller.locations.bands.update', ['location' => $this->shelf, 'item' => $this->pen]), [
            'item_packaging_type_id' => $this->packetType->id, 'max' => 10, 'refill' => 5, 'critical' => 2,
        ]);

        $this->asSeller($this->seller)
            ->getJson(route('seller.locations.assignable', $this->shelf).'?q=note')
            ->assertOk()
            ->assertJsonCount(1, 'items')
            ->assertJsonPath('items.0.name', 'Notebook');

        $this->asSeller($this->seller)
            ->getJson(route('seller.locations.assignable', $this->shelf))
            ->assertJsonMissing(['name' => 'Bic Pen']);

        $colleague = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $colleague->assignRole('seller');
        $this->asSeller($colleague)->getJson(route('seller.locations.assignable', $this->shelf))->assertForbidden();
    }

    #[Test]
    public function a_bin_shows_its_refill_on_its_way_and_its_route(): void
    {
        $this->asSeller($this->seller)->patch(route('seller.locations.bands.update', ['location' => $this->shelf, 'item' => $this->pen]), [
            'item_packaging_type_id' => $this->packetType->id, 'max' => 10, 'refill' => 5, 'critical' => 2,
        ]);
        $this->asSeller($this->seller)->post(route('seller.locations.bands.refill', ['location' => $this->shelf, 'item' => $this->pen]));

        $this->asSeller($this->seller)
            ->get(route('seller.locations.show', $this->shelf))
            ->assertInertia(fn ($page) => $page
                ->where('canSetRoute', false)
                ->where('matrix.totals.refill_pending', 1)
                ->where('matrix.bins.0.route', ['floor', 'remote_hub', 'shipment'])
                ->where('matrix.bins.0.refills.0.source', 'floor')
                ->where('matrix.bins.0.refills.0.status', 'in_progress')
                ->where('matrix.bins.0.refills.0.display', '5 Packets'));
    }

    private function asSeller(User $user): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);
        $this->actingAs($user, 'web');

        return $this;
    }
}
