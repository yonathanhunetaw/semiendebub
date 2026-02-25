<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth', 'verified', 'check_role:Delivery'])
    ->prefix('delivery')
    ->name('delivery.')
    ->group(function () {

        Route::get('/dashboard', function () {
            return Inertia::render('Staff/Delivery/Dashboard/index');
        })->name('dashboard');

        // Example future route
        Route::get('/shipments', function () {
            return Inertia::render('Staff/Delivery/Shipments/index');
        })->name('shipments.index');

    });
