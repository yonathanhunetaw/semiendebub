<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::domain('seller.duka.local')
    ->middleware(['auth', 'verified', 'role.subdomain:seller'])
    ->name('seller.')
    ->group(function () {
        Route::get('/dashboard', function () {
            return Inertia::render('Seller/Dashboard/index');
        })->name('dashboard');

        // Example future route
        Route::get('/orders', function () {
            return Inertia::render('Seller/Orders/index');
        })->name('orders.index');
    });
