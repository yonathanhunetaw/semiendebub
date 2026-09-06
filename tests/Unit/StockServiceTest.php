<?php

namespace Tests\Unit;

use App\Exceptions\InsufficientStockException;
use App\Models\Inventory\InventoryMovement;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockServiceTest extends TestCase
{
    use RefreshDatabase;

    protected StockService $stockService;
    protected Store $store;
    protected Item $item;
    protected ItemVariant $itemVariant;
    protected StoreVariant $storeVariant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->stockService = new StockService();

        $this->store = Store::create([
            'name' => 'Flagship Store',
            'location' => 'Main Avenue',
            'status' => 'active',
        ]);

        $this->item = Item::create([
            'product_name' => 'Classic Notebook',
            'description' => 'A5 ruled notebook',
            'status' => 'active',
        ]);

        $this->itemVariant = ItemVariant::create([
            'item_id' => $this->item->id,
            'sku' => 'NOTEBOOK-A5-BLK',
        ]);

        $this->storeVariant = StoreVariant::create([
            'item_id' => $this->item->id,
            'item_variant_id' => $this->itemVariant->id,
            'store_id' => $this->store->id,
            'pricing_matrix' => ['price' => 150.00],
            'active' => true,
        ]);
    }

    public function test_initial_stock_is_zero_when_no_movements_exist(): void
    {
        $stock = $this->stockService->getCurrentStock($this->storeVariant);
        $this->assertEquals(0, $stock);
        $this->assertFalse($this->stockService->hasSufficientStock($this->storeVariant, 1));
        $this->assertTrue($this->stockService->hasSufficientStock($this->storeVariant, 0));
    }

    public function test_recording_purchase_increases_stock_balance(): void
    {
        $movement = $this->stockService->recordPurchase(
            storeVariant: $this->storeVariant,
            quantity: 50,
            reference: 'PO-TEST-001'
        );

        $this->assertInstanceOf(InventoryMovement::class, $movement);
        $this->assertEquals(50, $movement->quantity);
        $this->assertEquals('purchase', $movement->type);

        $currentStock = $this->stockService->getCurrentStock($this->storeVariant);
        $this->assertEquals(50, $currentStock);
        $this->assertTrue($this->stockService->hasSufficientStock($this->storeVariant, 50));
        $this->assertFalse($this->stockService->hasSufficientStock($this->storeVariant, 51));
    }

    public function test_recording_sale_decreases_stock_balance(): void
    {
        // Add 100 via purchase
        $this->stockService->recordPurchase($this->storeVariant, 100, 'PO-100');

        // Deduct 30 via sale
        $movement = $this->stockService->recordSale(
            storeVariant: $this->storeVariant,
            quantity: 30,
            reference: 'SALE-001'
        );

        $this->assertEquals(-30, $movement->quantity);
        $this->assertEquals('sale', $movement->type);

        $currentStock = $this->stockService->getCurrentStock($this->storeVariant);
        $this->assertEquals(70, $currentStock);
    }

    public function test_batch_stock_returns_accurate_map(): void
    {
        $variant2 = ItemVariant::create([
            'item_id' => $this->item->id,
            'sku' => 'NOTEBOOK-A5-BLU',
        ]);

        $storeVariant2 = StoreVariant::create([
            'item_id' => $this->item->id,
            'item_variant_id' => $variant2->id,
            'store_id' => $this->store->id,
            'active' => true,
        ]);

        $this->stockService->recordPurchase($this->storeVariant, 40, 'PO-1');
        $this->stockService->recordPurchase($storeVariant2, 15, 'PO-2');

        $batch = $this->stockService->getBatchStock([$this->storeVariant->id, $storeVariant2->id, 9999]);

        $this->assertEquals([
            $this->storeVariant->id => 40,
            $storeVariant2->id => 15,
            9999 => 0,
        ], $batch);
    }

    public function test_transfer_stock_moves_quantity_between_store_variants(): void
    {
        $store2 = Store::create(['name' => 'Secondary Store', 'location' => 'East Suburb']);
        $destVariant = StoreVariant::create([
            'item_id' => $this->item->id,
            'item_variant_id' => $this->itemVariant->id,
            'store_id' => $store2->id,
            'active' => true,
        ]);

        // Seed 100 units in source
        $this->stockService->recordPurchase($this->storeVariant, 100, 'PO-INIT');

        // Transfer 40 units to destination
        $transfer = $this->stockService->transferStock(
            fromVariant: $this->storeVariant,
            toVariant: $destVariant,
            quantity: 40,
            notes: 'Restocking secondary store'
        );

        $this->assertNotNull($transfer);
        $this->assertEquals('completed', $transfer->status);
        $this->assertEquals(40, $transfer->quantity);

        // Check balances: source has 60, destination has 40
        $this->assertEquals(60, $this->stockService->getCurrentStock($this->storeVariant));
        $this->assertEquals(40, $this->stockService->getCurrentStock($destVariant));
    }

    public function test_transfer_stock_throws_insufficient_stock_exception(): void
    {
        $store2 = Store::create(['name' => 'Secondary Store', 'location' => 'East Suburb']);
        $destVariant = StoreVariant::create([
            'item_id' => $this->item->id,
            'item_variant_id' => $this->itemVariant->id,
            'store_id' => $store2->id,
            'active' => true,
        ]);

        // Source has only 10 units
        $this->stockService->recordPurchase($this->storeVariant, 10, 'PO-INIT');

        $this->expectException(InsufficientStockException::class);
        $this->stockService->transferStock($this->storeVariant, $destVariant, 50);
    }
}
