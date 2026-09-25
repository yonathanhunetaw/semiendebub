<?php

use App\Http\Controllers\Admin\ItemDeployController;
use App\Http\Controllers\Admin\ItemController;
use App\Http\Controllers\Admin\SessionController;
use App\Http\Controllers\Admin\Store\StoreController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\Inventory\WarehouseController;
use App\Http\Controllers\Admin\Inventory\TransferController;
use App\Http\Controllers\Admin\Inventory\ReplenishController;
use App\Http\Controllers\Admin\Inventory\ShipmentController;
use App\Http\Controllers\Admin\CanvasController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("admin.{$baseDomain}")
    ->name('admin.')
    ->group(function () {

        // Guest routes
        Route::middleware(['guest.subdomain.login'])->group(function () {
            Route::middleware('notify.public.visit')->get('/', fn() => Inertia::render('Admin/Welcome/index'))->name('welcome');
            Route::get('/login', fn() => Inertia::render('Admin/Login/index'))->name('login');
        });

        // Authenticated Admin routes
        Route::middleware(['auth', 'verified', 'role.subdomain:admin'])->group(function () {

            Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
            Route::get('/settings', fn() => Inertia::render('Admin/Settings/Index'))->name('settings');

            // ── Canvas ──
            Route::prefix('canvas')->name('canvas.')->group(function () {
                Route::get('/', [CanvasController::class, 'index'])->name('index');
                Route::post('/create', [CanvasController::class, 'create'])->name('create');
                Route::post('/share', [CanvasController::class, 'share'])->name('share');
                Route::post('/unshare', [CanvasController::class, 'unshare'])->name('unshare');
                Route::post('/save', [CanvasController::class, 'save'])->name('save');
                Route::get('/version/{id}', [CanvasController::class, 'getVersion'])->name('version');
                Route::post('/upload-asset', [CanvasController::class, 'uploadAsset'])->name('upload-asset');
            });

            // ── Items ──
            Route::post('items/inline-options', [ItemController::class, 'storeInlineOption'])->name('items.inline-options');
            Route::patch('items/{item}/variants/{variant}/status', [ItemController::class, 'updateVariantStatus'])->name('items.variants.status');
            Route::delete('items/{item}/variants/{variant}', [ItemController::class, 'destroyVariant'])->name('items.variants.destroy');
            Route::post('items/{item}/deploy', [ItemDeployController::class, 'deploy'])->name('items.deploy');
            Route::resource('items', ItemController::class);

            // ── Users, Sessions & Customers ──
            Route::resource('users', UserController::class);
            Route::resource('customers', \App\Http\Controllers\Admin\CustomerController::class);
            Route::prefix('sessions')->group(function () {
                Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
                Route::post('/{id}/extend', [SessionController::class, 'extend'])->name('sessions.extend');
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

                // Shipments (shared cross-role domain)
                Route::get('/shipments', [ShipmentController::class, 'index'])->name('shipments.index');
                Route::post('/shipments', [ShipmentController::class, 'store'])->name('shipments.store');
                Route::get('/shipments/{shipment}', [ShipmentController::class, 'show'])->name('shipments.show');
                Route::post('/shipments/{shipment}/items', [ShipmentController::class, 'addItem'])->name('shipments.items.store');
                Route::delete('/shipments/{shipment}/items/{variant}', [ShipmentController::class, 'removeItem'])->name('shipments.items.destroy');
                Route::patch('/shipments/{shipment}/status', [ShipmentController::class, 'transition'])->name('shipments.transition');

                // Replenishment Shipments (3-phase workflow)
                Route::get('/replenish', [ReplenishController::class, 'index'])->name('replenish');
                Route::post('/replenish', [ReplenishController::class, 'store'])->name('replenish.store');
                Route::get('/replenish/{transfer}', [ReplenishController::class, 'show'])->name('replenish.show');
                Route::get('/replenish/{transfer}/review', [ReplenishController::class, 'review'])->name('replenish.review');
                Route::post('/replenish/{transfer}/dispatch', [ReplenishController::class, 'dispatch'])->name('replenish.dispatch');
                Route::get('/replenish/{transfer}/dispatched', [ReplenishController::class, 'dispatched'])->name('replenish.dispatched');
            });

        });
    });
