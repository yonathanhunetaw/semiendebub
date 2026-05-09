<?php

use App\Http\Controllers\Admin\Store\StoreController;
use Illuminate\Support\Facades\Route;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("admin.{$baseDomain}")
    ->middleware(['auth', 'verified', 'role.subdomain:admin'])
    ->group(function () {

        // ── Stores CRUD ───────────────────────────────────────────────────────
        Route::prefix('stores')->name('store.')->group(function () {
            Route::get('/',             [StoreController::class, 'index'])->name('index');
            Route::get('/create',       [StoreController::class, 'create'])->name('create');
            Route::get('/{store}',      [StoreController::class, 'show'])->name('show');
            Route::post('/',            [StoreController::class, 'store'])->name('store');
            Route::get('/{store}/edit', [StoreController::class, 'edit'])->name('edit');
            Route::patch('/{store}',    [StoreController::class, 'update'])->name('update');
            Route::delete('/{store}',   [StoreController::class, 'destroy'])->name('destroy');
        });

        // ── Inventory sidebar sub-routes ──────────────────────────────────────
        // /inventory/stores  → same StoreController@index view
        // /inventory/warehouse → placeholder (replace with WarehouseController later)
        Route::prefix('inventory')->name('inventory.')->group(function () {
            Route::get('/stores',    [StoreController::class, 'index'])->name('stores');
            Route::get('/warehouse', fn () => inertia('Admin/Inventory/Warehouse/index'))->name('warehouse');
            Route::get('/transfers', fn () => inertia('Admin/Inventory/Transfers/index'))->name('transfers');
        });
    });
