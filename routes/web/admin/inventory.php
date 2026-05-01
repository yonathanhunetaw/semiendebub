<?php
use App\Http\Controllers\Admin\Inventory\InventoryController;
use Illuminate\Support\Facades\Route;

Route::prefix('inventory')->name('inventory.')->group(function () {
    Route::get('/', [InventoryController::class, 'index'])->name('index'); // Store selection
    Route::get('/{store}', [InventoryController::class, 'show'])->name('show'); // Specific stock
});
