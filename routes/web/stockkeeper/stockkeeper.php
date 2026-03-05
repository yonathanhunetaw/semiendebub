<?php

use App\Http\Controllers\Stockkeeper\MenuController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::domain('stockKeeper.duka.local')
    ->middleware(['auth', 'verified', 'role.subdomain:stock_keeper'])
    ->name('stock_keeper.')
    ->group(function () {
        Route::get('/dashboard', function () {
            return Inertia::render('StockKeeper/Dashboard/index');
        })->name('dashboard');

        Route::get('/', [MenuController::class, 'index'])->name('sessions.index');
    });
