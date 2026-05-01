<?php

use App\Http\Controllers\Admin\CartController;
use App\Http\Controllers\Admin\InventoryController; // Corrected Import
use Illuminate\Support\Facades\Route;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("admin.{$baseDomain}")
    ->middleware(['auth', 'verified', 'role.subdomain:admin'])
    ->group(function () {

        // --- Carts Group (Existing) ---
        Route::prefix('carts')->group(function () {
            Route::get('/', [CartController::class, 'index'])->name('admin.carts.index');
            Route::get('/create', [CartController::class, 'create'])->name('admin.carts.create');
            Route::get('/{cart}', [CartController::class, 'show'])->name('admin.carts.show');
        });

        // --- Inventory Group (Fixed) ---
        Route::prefix('inventory')->group(function () {
            Route::get('/', [InventoryController::class, 'index'])->name('inventory.index');
            Route::get('/{store}', [InventoryController::class, 'show'])->name('inventory.show');
        });

    });
