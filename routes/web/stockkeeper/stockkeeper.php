<?php

use App\Http\Controllers\StockKeeper\DashboardController;
use App\Http\Controllers\StockKeeper\InventoryController;
use App\Http\Controllers\StockKeeper\OrderController;
use App\Http\Controllers\StockKeeper\StockAlertController;
use App\Http\Controllers\StockKeeper\TransferController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("stockkeeper.{$baseDomain}")
    ->name('stock_keeper.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('StockKeeper/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('StockKeeper/Login/index');
            })->name('login');
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:stock_keeper'])->group(function () {
            Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

            // --- INVENTORY LEDGER ---
            Route::get('/inventory', [InventoryController::class, 'index'])->name('inventory.index');
            Route::post('/inventory/receive', [InventoryController::class, 'receive'])->name('inventory.receive');
            Route::patch('/inventory/{stock}/adjust', [InventoryController::class, 'adjust'])->name('inventory.adjust');

            // --- TRANSFERS ---
            Route::get('/transfers', [TransferController::class, 'index'])->name('transfers.index');
            Route::post('/transfers', [TransferController::class, 'store'])->name('transfers.store');
            Route::post('/transfers/{transfer}/dispatch', [TransferController::class, 'dispatchTransfer'])->name('transfers.dispatch');
            Route::post('/transfers/{transfer}/complete', [TransferController::class, 'complete'])->name('transfers.complete');
            Route::post('/transfers/{transfer}/cancel', [TransferController::class, 'cancel'])->name('transfers.cancel');

            Route::get('/orders', [OrderController::class, 'index'])->name('orders.index');
            Route::get('/stock-alerts', [StockAlertController::class, 'index'])->name('alerts.index');
        });
    });
