<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::domain('delivery.duka.local')
    ->middleware(['auth', 'verified', 'role:delivery'])
    ->name('delivery.')
    ->group(function () {

        Route::get('/dashboard', function () {
            return Inertia::render('Delivery/Dashboard/index');
        })->name('dashboard');

        // Example future route
        Route::get('/shipments', function () {
            return Inertia::render('Delivery/Shipments/index');
        })->name('shipments.index');

    });
