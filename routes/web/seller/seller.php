<?php

use App\Http\Controllers\Seller\CartController;
use App\Http\Controllers\Seller\CategoryController;
use App\Http\Controllers\Seller\CustomerController;
use App\Http\Controllers\Seller\DashboardController;
use App\Http\Controllers\Seller\ItemController;
use App\Http\Controllers\Seller\MenuController;
use App\Http\Controllers\Seller\SellerSettingsController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("seller.$baseDomain")
    ->name('seller.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('Seller/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Seller/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:seller'])->group(function () {
            Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
            Route::get('/menu', [MenuController::class, 'index'])->name('menu.index');
            Route::get('/orders', [CartController::class, 'index'])->name('orders.index');
            Route::get('/carts', [CartController::class, 'index'])->name('carts.index');
            Route::get('/items', [ItemController::class, 'index'])->name('items.index');
            Route::get('/items/{item}', [ItemController::class, 'show'])->name('items.show');
            Route::resource('customers', CustomerController::class)->only(['index', 'create', 'store', 'show', 'edit', 'update', 'destroy']);
            Route::resource('categories', CategoryController::class)->only(['index', 'show']);
            Route::resource('carts', CartController::class)->only(['create', 'store', 'show', 'edit', 'update', 'destroy']);
            Route::post('/carts/{cart}/items', [CartController::class, 'storeItem'])->name('carts.items.store');
            Route::get('/settings', [SellerSettingsController::class, 'index'])->name('settings.index');
            Route::patch('/settings', [SellerSettingsController::class, 'update'])->name('settings.update');
        });
    });
