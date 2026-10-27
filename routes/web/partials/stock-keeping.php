<?php

declare(strict_types=1);

use App\Http\Controllers\Fulfillment\PickProgressController;
use App\Http\Controllers\StockKeeper\DashboardController;
use App\Http\Controllers\StockKeeper\FloorController;
use App\Http\Controllers\StockKeeper\ItemController;
use App\Http\Controllers\StockKeeper\InventoryController;
use App\Http\Controllers\StockKeeper\LevelController;
use App\Http\Controllers\StockKeeper\OrderController;
use App\Http\Controllers\StockKeeper\ReceivingController;
use App\Http\Controllers\StockKeeper\ShelfRefillController;
use App\Http\Controllers\StockKeeper\ShelvingController;
use App\Http\Controllers\StockKeeper\ShipmentController;
use App\Http\Controllers\StockKeeper\StockAlertController;
use App\Http\Controllers\StockKeeper\StocktakeController;
use App\Http\Controllers\StockKeeper\TransferController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| The stock keeper's working routes
|--------------------------------------------------------------------------
| Required from inside an authenticated group, so it inherits that group's
| name prefix and middleware: `stock_keeper.*` on the stockkeeper app, and
| `seller.stock.*` (under /stock, acting as a stock keeper) in the seller app
| for a seller who is also ticked as a stock keeper. The guide, calendar and
| My work stay in each app's own routes.
*/

Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

// --- INVENTORY LEDGER ---
Route::get('/inventory', [InventoryController::class, 'index'])->name('inventory.index');
// The variant rows behind one item row, fetched on expand.
Route::get('/inventory/items/{item}/variants', [InventoryController::class, 'variants'])
    ->name('inventory.items.variants');
// Receive picker: item search, then that item's variants.
Route::get('/inventory/item-options', [InventoryController::class, 'itemOptions'])
    ->name('inventory.item_options');
Route::get('/inventory/items/{item}/variant-options', [InventoryController::class, 'itemVariantOptions'])
    ->name('inventory.items.variant_options');
Route::post('/inventory/receive', [InventoryController::class, 'receive'])->name('inventory.receive');
Route::patch('/inventory/{stock}/adjust', [InventoryController::class, 'adjust'])->name('inventory.adjust');

// --- ARRIVALS: goods we bought, counted in at a Main Hub (procurement pipeline PP5) ---
Route::get('/arrivals', [\App\Http\Controllers\StockKeeper\ArrivalController::class, 'index'])->name('arrivals.index');
Route::post('/arrivals/{consignment}/receive', [\App\Http\Controllers\StockKeeper\ArrivalController::class, 'receive'])
    ->whereNumber('consignment')->name('arrivals.receive');

// --- TRANSFERS ---
Route::get('/transfers', [TransferController::class, 'index'])->name('transfers.index');
Route::post('/transfers', [TransferController::class, 'store'])->name('transfers.store');
Route::post('/transfers/{transfer}/dispatch', [TransferController::class, 'dispatchTransfer'])->name('transfers.dispatch');
Route::post('/transfers/{transfer}/complete', [TransferController::class, 'complete'])->name('transfers.complete');
Route::post('/transfers/{transfer}/cancel', [TransferController::class, 'cancel'])->name('transfers.cancel');

// --- SHELF REFILLS ---
// Raise one by hand (start_at skips to the Remote Hub or a shipment),
// and accept an approved one at the Remote Hub.
Route::get('/shelving', [ShelvingController::class, 'index'])->name('shelving.index');
Route::post('/shelving/{transfer}', [ShelvingController::class, 'shelve'])->name('shelving.shelve');
Route::get('/shelving/permissions', [ShelvingController::class, 'permissions'])->name('shelving.permissions');
Route::post('/shelves/{location}/refills/{item}', [ShelfRefillController::class, 'store'])->name('shelves.refill');
Route::post('/refills/{refillRequest}/accept', [ShelfRefillController::class, 'accept'])->name('refills.accept');

// --- SHIPMENTS (shared cross-role domain) ---
Route::get('/shipments', [ShipmentController::class, 'index'])->name('shipments.index');
Route::get('/shipments/{shipment}', [ShipmentController::class, 'show'])->name('shipments.show');
Route::post('/shipments/{shipment}/pick', [ShipmentController::class, 'pick'])->name('shipments.pick');
Route::post('/shipments/{shipment}/agree', [ShipmentController::class, 'agree'])->name('shipments.agree');
// The hand-off steps after scheduling: pick, prepare, check, sign.
Route::post('/shipments/{shipment}/steps/{step}', [ShipmentController::class, 'step'])->name('shipments.step');
Route::patch('/shipments/{shipment}/status', [ShipmentController::class, 'transition'])->name('shipments.transition');

Route::get('/orders', [OrderController::class, 'index'])->name('orders.index');

// Pick the order and hand it to Delivery.
Route::post('/orders/{sale}/pick', [OrderController::class, 'confirmSourcing'])->name('orders.pick');
// The same Pick & pack progress the seller app records.
Route::post('/orders/{sale}/picking', [PickProgressController::class, 'start'])->name('orders.picking.start');
Route::post('/orders/{sale}/lines/{item}/tick', [PickProgressController::class, 'tick'])->name('orders.lines.tick');
Route::post('/orders/{sale}/packed', [PickProgressController::class, 'packed'])->name('orders.packed');
Route::get('/stock-alerts', [StockAlertController::class, 'index'])->name('alerts.index');

// Stock levels at hubs and store floors: full / low / crit-low and volume.
Route::get('/levels', [LevelController::class, 'index'])->name('levels.index');
Route::put('/levels/{location}/items/{item}', [LevelController::class, 'update'])->name('levels.update');
Route::delete('/levels/{location}/items/{item}', [LevelController::class, 'destroy'])->name('levels.destroy');
Route::put('/levels/{location}/capacity', [LevelController::class, 'capacity'])->name('levels.capacity');

// Floor plan: a hub's floor in metres, areas, and which items sit where.
Route::get('/floor', [FloorController::class, 'index'])->name('floor.index');
Route::put('/floor/{location}/size', [FloorController::class, 'size'])->name('floor.size');
Route::post('/floor/{location}/areas', [FloorController::class, 'storeArea'])->name('floor.areas.store');
Route::put('/floor/{location}/areas/{area}', [FloorController::class, 'updateArea'])->name('floor.areas.update');
Route::delete('/floor/{location}/areas/{area}', [FloorController::class, 'destroyArea'])->name('floor.areas.destroy');
Route::post('/floor/{location}/areas/{area}/items', [FloorController::class, 'place'])->name('floor.areas.place');
Route::delete('/floor/{location}/areas/{area}/items/{item}', [FloorController::class, 'unplace'])->name('floor.areas.unplace');

// Items (read-only catalogue + where it is) and the scanner.
Route::get('/scan', [ItemController::class, 'scan'])->name('scan');
Route::get('/items/{item}', [ItemController::class, 'show'])->name('items.show');

// Receiving with discrepancies.
Route::get('/receiving', [ReceivingController::class, 'index'])->name('receiving.index');
Route::post('/receiving/{discrepancy}/resolve', [ReceivingController::class, 'resolve'])->name('receiving.resolve');
Route::post('/shipments/{shipment}/receipt', [ReceivingController::class, 'shipmentReceipt'])->name('shipments.receipt');

// Stocktakes (cycle counts).
Route::get('/stocktakes', [StocktakeController::class, 'index'])->name('stocktakes.index');
Route::post('/stocktakes', [StocktakeController::class, 'store'])->name('stocktakes.store');
Route::get('/stocktakes/{stocktake}', [StocktakeController::class, 'show'])->name('stocktakes.show');
Route::post('/stocktakes/{stocktake}/count', [StocktakeController::class, 'count'])->name('stocktakes.count');
Route::post('/stocktakes/{stocktake}/submit', [StocktakeController::class, 'submit'])->name('stocktakes.submit');
Route::post('/stocktakes/{stocktake}/post', [StocktakeController::class, 'post'])->name('stocktakes.post');
Route::post('/stocktakes/{stocktake}/void', [StocktakeController::class, 'void'])->name('stocktakes.void');
