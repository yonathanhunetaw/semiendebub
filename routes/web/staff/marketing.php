<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth', 'verified', 'check_role:Marketing'])
    ->prefix('marketing')
    ->name('marketing.')
    ->group(function () {

        Route::get('/dashboard', function () {
            return Inertia::render('Staff/Marketing/Dashboard/index');
        })->name('dashboard');

        // Example future route
        Route::get('/campaigns', function () {
            return Inertia::render('Staff/Marketing/Campaigns/index');
        })->name('campaigns.index');

    });
