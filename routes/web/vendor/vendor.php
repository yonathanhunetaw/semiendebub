<?php

use App\Http\Controllers\Vendor\CatalogueController;
use App\Http\Controllers\Vendor\DashboardController;
use App\Http\Controllers\Vendor\ProfileController;
use App\Http\Controllers\Vendor\PurchaseOrderController;
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
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:vendor'])->group(function () {
            Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

            // --- SUPPLIED SKUS ---
            Route::get('/catalogue', [CatalogueController::class, 'index'])->name('catalogue.index');

            // --- ORDERS PLACED WITH THIS VENDOR (read-only) ---
            Route::get('/orders', [PurchaseOrderController::class, 'index'])->name('orders.index');
            Route::get('/orders/{purchase}', [PurchaseOrderController::class, 'show'])->name('orders.show');

            // --- PROFILE ---
            Route::get('/profile', [ProfileController::class, 'index'])->name('profile.index');
            Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
        });
    });
