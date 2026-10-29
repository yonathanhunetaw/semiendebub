<?php

use App\Http\Controllers\Vendor\ApplicationController;
use App\Http\Controllers\Vendor\CatalogueController;
use App\Http\Controllers\Vendor\DashboardController;
use App\Http\Controllers\Vendor\OrderController;
use App\Http\Controllers\Vendor\ProfileController;
use App\Http\Controllers\Vendor\StoreProfileController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("vendor.$baseDomain")
    ->name('vendor.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('Vendor/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Vendor/Login/index');
            })->name('login');

            // "Sell on Duka": a business asks to open its own store.
            Route::post('/apply', [ApplicationController::class, 'store'])
                ->middleware('throttle:5,1')
                ->name('apply');
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:vendor'])->group(function () {
            Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

            // A vendor is a store: what it lists, the orders placed with it, its public profile.
            Route::get('/catalogue', [CatalogueController::class, 'index'])->name('catalogue.index');

            Route::get('/orders', [OrderController::class, 'index'])->name('orders.index');
            Route::get('/orders/{sale}', [OrderController::class, 'show'])->name('orders.show');

            // The store's public face, and the person's own details.
            Route::get('/store', [StoreProfileController::class, 'index'])->name('store.edit');
            Route::patch('/store', [StoreProfileController::class, 'update'])->name('store.update');

            Route::get('/profile', [ProfileController::class, 'index'])->name('profile.index');
            Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
        });
    });
