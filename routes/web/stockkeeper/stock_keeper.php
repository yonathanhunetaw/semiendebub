<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth', 'verified', 'check_role:StockKeeper'])
    ->prefix('stock-keeper')
    ->name('stock_keeper.')
    ->group(function () {

        Route::get('/dashboard', function () {
            return Inertia::render('Staff/StockKeeper/Dashboard/index');
        })->name('dashboard');

    });
