<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth', 'verified', 'check_role:Finance'])
    ->prefix('finance')
    ->name('finance.')
    ->group(function () {

        Route::get('/dashboard', function () {
            return Inertia::render('Staff/Finance/Dashboard/index');
        })->name('dashboard');

        // Example future route
        Route::get('/reports', function () {
            return Inertia::render('Staff/Finance/Reports/index');
        })->name('reports.index');

    });
