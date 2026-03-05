<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::domain('procurement.duka.local')
    ->middleware(['auth', 'verified', 'role.subdomain:procurement'])
    ->name('procurement.')
    ->group(function () {

        Route::get('/dashboard', function () {
            return Inertia::render('Staff/Procurement/Dashboard/index');
        })->name('dashboard');

        // Example future route
        Route::get('/purchase-orders', function () {
            return Inertia::render('Staff/Procurement/PurchaseOrders/index');
        })->name('purchase_orders.index');

    });
