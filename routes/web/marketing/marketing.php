<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::domain('marketing.duka.local')
    ->middleware(['auth', 'verified', 'role.subdomain:marketing'])
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
