<?php

use App\Http\Controllers\Admin\Inventory\InventoryController;
use Illuminate\Support\Facades\Route;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("admin.{$baseDomain}")
    ->middleware(['auth', 'verified', 'role.subdomain:admin'])
    ->prefix('inventory')
    ->group(function () {
        // Path: admin.duka.pi/inventory
        Route::get('/', [InventoryController::class, 'index'])->name('inventory.index');

        // Path: admin.duka.pi/inventory/{store}
        Route::get('/{store}', [InventoryController::class, 'show'])->name('inventory.show');
    });
