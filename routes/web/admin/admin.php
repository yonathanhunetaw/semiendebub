<?php

use App\Http\Controllers\Admin\Item\ItemDeployController;
use App\Http\Controllers\Admin\ItemController;
use App\Http\Controllers\Admin\SessionController;
use App\Http\Controllers\Admin\Store\StoreController;
use App\Http\Controllers\Admin\UserController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use App\Http\Controllers\Admin\Inventory\WarehouseController;
use App\Http\Controllers\Admin\Inventory\TransferController;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("admin.{$baseDomain}")
    ->name('admin.')
    ->group(function () {

        // Added 'Allow Subdomain  Login' so logged-in users don't see the login form
        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('Admin/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Admin/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:admin'])->group(function () {

            Route::get('/dashboard', function () {
                return Inertia::render('Admin/Dashboard/index');
            })->name('dashboard');

            Route::get('/settings', function () {
                return Inertia::render('Admin/Settings/index');
            })->name('settings');

            // Backwards-compatible URL (if you navigate to /admin/settings on the admin subdomain)
            Route::get('/admin/settings', function () {
                return redirect()->route('admin.settings');
            });

            // ── Items ─────────────────────────────────────────────────────────
            Route::post('items/inline-options', [ItemController::class, 'storeInlineOption'])->name('items.inline-options');
            Route::patch('items/{item}/variants/{variant}/status', [ItemController::class, 'updateVariantStatus'])->name('items.variants.status');
            Route::delete('items/{item}/variants/{variant}', [ItemController::class, 'destroyVariant'])->name('items.variants.destroy');
            Route::post('items/{item}/deploy', [ItemDeployController::class, 'deploy'])->name('items.deploy');
            Route::resource('items', ItemController::class);

            // ── Users ─────────────────────────────────────────────────────────
            Route::resource('users', UserController::class);

            // ── Sessions ──────────────────────────────────────────────────────
            Route::prefix('sessions')->group(function () {
                Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
                Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
            });

            // ── Stores (CRUD) ─────────────────────────────────────────────────
            Route::resource('stores', StoreController::class);

            // ── Inventory sidebar sub-pages ───────────────────────────────────
            Route::prefix('inventory')->name('inventory.')->group(function () {
                Route::get('/stores',    [StoreController::class, 'index'])->name('stores');
                Route::get('/warehouse', fn () => Inertia::render('Admin/Inventory/Warehouse/index'))->name('warehouse');
                Route::get('/transfers', fn () => Inertia::render('Admin/Inventory/Transfers/index'))->name('transfers');
            });
        });
    });

// Route::domain('/')
//    ->name('admin.')
//    ->group(function () {
//
//        // Added 'AllowSubdomainLogin' so logged-in users don't see the login form
//        Route::middleware(['auth', 'verified', 'role.subdomain:admin'])->group(function () {
//
//            Route::get('/', function () {
//                return Inertia::render('Admin/Dashboard/index');
//            })->name('dashboard');
//
//        });
//    });

// Add these imports to the top of admin.php:
// use App\Http\Controllers\Admin\Inventory\WarehouseController;
// use App\Http\Controllers\Admin\Inventory\TransferController;

// Replace the placeholder inventory routes in admin.php with this block:

Route::prefix('inventory')->name('inventory.')->group(function () {

    // Stores view (reuses StoreController)
    Route::get('/stores', [StoreController::class, 'index'])->name('stores');

    // Warehouse — locations CRUD + stock view
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
