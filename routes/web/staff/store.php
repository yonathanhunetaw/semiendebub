<?php

use App\Http\Controllers\Staff\Store\StoreController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', 'check_role:Admin'])->prefix('stores')->group(function () {
    Route::get('/', [StoreController::class, 'index'])->name('store.index');
    Route::get('/create', [StoreController::class, 'create'])->name('store.create');
    Route::post('/', [StoreController::class, 'store'])->name('store.store');
    Route::get('/{store}/edit', [StoreController::class, 'edit'])->name('store.edit');
    Route::patch('/{store}', [StoreController::class, 'update'])->name('store.update');
    Route::delete('/{store}', [StoreController::class, 'destroy'])->name('store.destroy');
});
