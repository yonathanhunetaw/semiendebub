<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\StockLocationTree;
use App\Services\StockService;
use App\Services\TransferWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Admin → Stores → Replenish: the store's transfers, plus an auto-queued row
 * for every variant under two cartons that has no transfer open.
 */
class AdminReplenishScreenTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');
        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->admin);
    }

    private function variant(string $sku): StoreVariant
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id, 'sku' => $sku]);

        return StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id]);
    }

    private function floor(): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
    }

    #[Test]
    public function the_screen_lists_real_transfers_and_queues_only_what_is_short_and_not_already_coming(): void
    {
        $coming = $this->variant('SKU-COMING');
        $short = $this->variant('SKU-SHORT');
        $plenty = $this->variant('SKU-PLENTY');

        // One piece per unit, so two cartons is 20 pieces.
        app(StockService::class)->receive($plenty->item_variant_id, $this->floor(), 25);
        app(StockService::class)->receive($short->item_variant_id, $this->floor(), 5);

        $remote = app(StockLocationTree::class)->addRemoteHub($this->store);
        app(StockService::class)->receive($coming->item_variant_id, $remote, 50);
        $transfer = app(TransferWorkflowService::class)->create(
            variantId: $coming->item_variant_id, fromStoreId: null, toStoreId: $this->store->id, quantity: 30,
            initiatedBy: $this->admin->id, notes: 'top-up',
            sourceLocationType: StockLocation::class, sourceLocationId: $remote->id,
            destinationLocationType: StockLocation::class, destinationLocationId: $this->floor()->id,
            storeVariantId: $coming->id,
        );

        $this->get(route('store.replenish', $this->store))->assertOk()
            ->assertInertia(function ($page) use ($transfer, $short) {
                $page->component('Admin/Inventory/Stores/Replenish')->where('store.id', $this->store->id);
                $rows = collect($page->toArray()['props']['transfers']);

                $real = $rows->firstWhere('reference', $transfer->reference);
                $this->assertNotNull($real);
                $this->assertSame('SKU-COMING', $real['variant']['sku']);
                $this->assertSame(30, $real['qty']);
                $this->assertSame(3, $real['cartons']);
                $this->assertSame('top-up', $real['note']);
                $this->assertSame($this->floor()->name, $real['destination']);
                $this->assertSame(StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_REMOTE_HUB)->sole()->name, $real['source']);

                $queued = $rows->filter(fn ($row) => str_starts_with($row['reference'], 'AUTO-'));
                $this->assertSame(['SKU-SHORT'], $queued->pluck('variant.sku')->values()->all(), 'short and not already coming');
                $this->assertSame('AUTO-'.$short->id, $queued->first()['reference']);
                $this->assertSame(10, $queued->first()['qty'], 'one carton');
            });
    }

    #[Test]
    public function an_empty_store_has_nothing_to_replenish(): void
    {
        $this->get(route('store.replenish', $this->store))->assertOk()
            ->assertInertia(fn ($page) => $page->where('transfers', []));
    }
}
