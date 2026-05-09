<?php

use App\Http\Controllers\Admin\InventoryController;
use App\Http\Controllers\Admin\Inventory\WarehouseController;
use Illuminate\Support\Facades\Route;

Route::prefix('inventory')->group(function () {

    // --- General Inventory ---
    Route::get('/', [InventoryController::class, 'index'])->name('inventory.index');
    Route::get('/show/{store}', [InventoryController::class, 'show'])->name('inventory.show');

    // --- Warehouse Management ---
    Route::prefix('warehouse')->group(function () {
        Route::get('/', [WarehouseController::class, 'index'])->name('admin.inventory.warehouse.index');
        Route::get('/create', [WarehouseController::class, 'create'])->name('admin.inventory.warehouse.create');
        Route::post('/', [WarehouseController::class, 'store'])->name('admin.inventory.warehouse.store');
        Route::get('/{warehouse}/edit', [WarehouseController::class, 'edit'])->name('admin.inventory.warehouse.edit');
        Route::put('/{warehouse}', [WarehouseController::class, 'update'])->name('admin.inventory.warehouse.update');
        Route::delete('/{warehouse}', [WarehouseController::class, 'destroy'])->name('admin.inventory.warehouse.destroy');

        // Detailed view of a specific warehouse's stock
        Route::get('/{warehouse}', [WarehouseController::class, 'show'])->name('admin.inventory.warehouse.show');
    });
});
