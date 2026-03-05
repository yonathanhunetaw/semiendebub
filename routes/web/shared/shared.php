<?php

use App\Http\Controllers\Stockkeeper\MenuController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::domain('shared.duka.local')
    ->middleware(['auth', 'verified', 'role.subdomain:shared'])
    ->name('shared.')
    ->group(function () {
        Route::get('/dashboard', function () {
            return Inertia::render('shared/Dashboard/index');
        })->name('dashboard');

        Route::get('/', [MenuController::class, 'index'])->name('sessions.index');
    });
