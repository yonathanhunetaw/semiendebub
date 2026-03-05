<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::domain('delivery.duka.local')
    ->middleware(['auth', 'verified', 'role.subdomain:delivery'])
    ->name('delivery.')
    ->group(function () {
        Route::get('/dashboard', function () {
            return Inertia::render('Delivery/Dashboard/index');
        })->name('dashboard');

        Route::get('/login', function () {
            return Inertia::render('Delivery/Login/index');
        });
        Route::get('/shipments', function () {
            return Inertia::render('Delivery/Shipments/index');
        })->name('shipments.index');
    });
