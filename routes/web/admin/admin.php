<?php

use App\Http\Controllers\Admin\Item\ItemDeployController;
use App\Http\Controllers\Admin\ItemController;
use App\Http\Controllers\Admin\SessionController;
use App\Http\Controllers\Admin\Store\StoreController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\Inventory\WarehouseController;
use App\Http\Controllers\Admin\Inventory\TransferController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("admin.{$baseDomain}")
    ->name('admin.')
    ->group(function () {

        // Guest routes
        Route::middleware(['guest.subdomain.login'])->group(function () {
            Route::middleware('notify.public.visit')->get('/', fn () => Inertia::render('Admin/Welcome/index'))->name('welcome');
            Route::get('/login', fn () => Inertia::render('Admin/Login/index'))->name('login');
        });

        // Authenticated Admin routes
        Route::middleware(['auth', 'verified', 'role.subdomain:admin'])->group(function () {

            Route::get('/dashboard', fn () => Inertia::render('Admin/Dashboard/index'))->name('dashboard');
            Route::get('/settings', fn () => Inertia::render('Admin/Settings/index'))->name('settings');

            // ── Items ──
            Route::post('items/inline-options', [ItemController::class, 'storeInlineOption'])->name('items.inline-options');
            Route::patch('items/{item}/variants/{variant}/status', [ItemController::class, 'updateVariantStatus'])->name('items.variants.status');
            Route::delete('items/{item}/variants/{variant}', [ItemController::class, 'destroyVariant'])->name('items.variants.destroy');
            Route::post('items/{item}/deploy', [ItemDeployController::class, 'deploy'])->name('items.deploy');
            Route::resource('items', ItemController::class);

            // ── Users & Sessions ──
            Route::resource('users', UserController::class);
            Route::prefix('sessions')->group(function () {
                Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
                Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
            });

            // ── Stores ──
            Route::resource('stores', StoreController::class);

            // ── Unified Inventory & Warehouse ──
            Route::prefix('inventory')->name('inventory.')->group(function () {

                // Stores view
                Route::get('/stores', [StoreController::class, 'index'])->name('stores');

                // Warehouse CRUD
                Route::get('/warehouse', [WarehouseController::class, 'index'])->name('warehouse');
                Route::get('/warehouse/locations/create', [WarehouseController::class, 'create'])->name('locations.create');
                Route::post('/warehouse/locations', [WarehouseController::class, 'store'])->name('locations.store');
                Route::get('/warehouse/locations/{location}/edit', [WarehouseController::class, 'edit'])->name('locations.edit');
                Route::patch('/warehouse/locations/{location}', [WarehouseController::class, 'update'])->name('locations.update');
                Route::delete('/warehouse/locations/{location}', [WarehouseController::class, 'destroy'])->name('locations.destroy');

                // Transfers
                Route::get('/transfers', [TransferController::class, 'index'])->name('transfers');
                Route::get('/transfers/create', [TransferController::class, 'create'])->name('transfers.create');
                Route::post('/transfers', [TransferController::class, 'store'])->name('transfers.store');
                Route::get('/transfers/{transfer}', [TransferController::class, 'show'])->name('transfers.show');
                Route::patch('/transfers/{transfer}/complete', [TransferController::class, 'complete'])->name('transfers.complete');
                Route::patch('/transfers/{transfer}/cancel', [TransferController::class, 'cancel'])->name('transfers.cancel');
            });
        });
    });
