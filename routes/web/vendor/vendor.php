<?php

// Empty for now, placeholder for Vendor pages

use App\Http\Controllers\Stockkeeper\MenuController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::domain('vendor.duka.local')
    ->middleware(['auth', 'verified', 'role.subdomain:vendor'])
    ->name('vendor.')
    ->group(function () {
        Route::get('/dashboard', function () {
            return Inertia::render('vendor/Dashboard/index');
        })->name('dashboard');

        Route::get('/', [MenuController::class, 'index'])->name('sessions.index');
    });
