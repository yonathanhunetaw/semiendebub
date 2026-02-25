<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth', 'verified', 'check_role:Seller'])
    ->prefix('seller')
    ->name('seller.')
    ->group(function () {

        Route::get('/dashboard', function () {
            return Inertia::render('Staff/Seller/Dashboard/index');
        })->name('dashboard');

        // Example future route
        Route::get('/orders', function () {
            return Inertia::render('Staff/Seller/Orders/index');
        })->name('orders.index');

    });
