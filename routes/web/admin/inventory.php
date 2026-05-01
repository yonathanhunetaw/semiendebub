<?php

use App\Http\Controllers\Admin\InventoryController;
use Illuminate\Support\Facades\Route;

// No need for Route::domain here if web.php already wraps it
Route::prefix('inventory')->group(function () {
    Route::get('/', [InventoryController::class, 'index'])->name('inventory.index');
    Route::get('/{store}', [InventoryController::class, 'show'])->name('inventory.show');
});
