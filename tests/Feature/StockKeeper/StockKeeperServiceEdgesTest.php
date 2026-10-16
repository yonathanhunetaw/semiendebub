<?php

declare(strict_types=1);

namespace Tests\Feature\StockKeeper;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\StockKeeperService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * StockKeeperService helpers: where a keeper is posted, how a figure reads
 * against its minimum, the variant picker's search, and refusing a place
 * that cannot hold stock.
 */
class StockKeeperServiceEdgesTest extends TestCase
{
    use RefreshDatabase;

    private StockKeeperService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(StockKeeperService::class);
    }

    #[Test]
    public function a_keepers_posting_is_named_only_when_it_exists(): void
    {
        $store = Store::factory()->create();
        $area = $store->inventoryLocations()->shelves()->firstOrFail();

        $this->assertNull($this->service->assignedLocation(null));
        $this->assertNull($this->service->assignedLocation(User::factory()->make(['inventory_location_id' => null])));
        $this->assertNull($this->service->assignedLocation(User::factory()->make(['inventory_location_id' => 999999])));
        $this->assertSame(['id' => (int) $area->id, 'name' => (string) $area->name], $this->service->assignedLocation(User::factory()->make(['inventory_location_id' => $area->id])));
    }

    #[Test]
    public function a_figure_reads_against_its_minimum(): void
    {
        $this->assertSame('out_of_stock', $this->service->stockStatus(0, 10));
        $this->assertSame('out_of_stock', $this->service->stockStatus(-2, 0));
        $this->assertSame('critical', $this->service->stockStatus(5, 10));
        $this->assertSame('low_stock', $this->service->stockStatus(8, 10));
        $this->assertSame('healthy', $this->service->stockStatus(11, 10));
        $this->assertSame('healthy', $this->service->stockStatus(1, 0), 'no minimum, no alarm');
    }

    #[Test]
    public function the_variant_picker_searches_by_sku_or_product_name(): void
    {
        $paint = Item::factory()->create(['product_name' => 'Wall Paint']);
        ItemVariant::factory()->create(['item_id' => $paint->id, 'sku' => 'PNT-001']);
        ItemVariant::factory()->create(['item_id' => Item::factory()->create(['product_name' => 'Cement'])->id, 'sku' => 'CEM-001']);

        $this->assertSame(['PNT-001'], $this->service->variantOptions('paint')->pluck('sku')->all());
        $this->assertSame(['CEM-001'], $this->service->variantOptions('CEM')->pluck('sku')->all());
        $this->assertCount(2, $this->service->variantOptions(''));
        $this->assertCount(1, $this->service->variantOptions(null, 1));
    }

    #[Test]
    public function stock_cannot_be_received_into_a_place_that_does_not_hold_it(): void
    {
        $variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]);

        $this->expectExceptionMessage('That location cannot hold stock.');
        $this->service->receive($variant->id, 'Not\\A\\Location', 1, 5);
    }
}
