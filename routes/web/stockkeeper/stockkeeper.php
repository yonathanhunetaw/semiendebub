<?php

use App\Http\Controllers\StockKeeper\DashboardController;
use App\Http\Controllers\StockKeeper\InventoryController;
use App\Http\Controllers\StockKeeper\OrderController;
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
            Route::get('/inventory', [InventoryController::class, 'index'])->name('inventory.index');
            Route::get('/orders', [OrderController::class, 'index'])->name('orders.index');
            Route::get('/stock-alerts', function () {
                return Inertia::render('StockKeeper/StockAlerts/index');
            })->name('alerts.index');
        });
    });
