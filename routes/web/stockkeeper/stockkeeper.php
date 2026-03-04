<?php

use App\Http\Controllers\Stockkeeper\MenuController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth', 'verified', 'check_role:StockKeeper'])->prefix('sk')->name('stockkeeper.')->group(function () {

    Route::get('/dashboard', function () {
        return Inertia::render('StockKeeper/Dashboard/index');
    })->name('dashboard');

    Route::get('/', [MenuController::class, 'index'])->name('sessions.index');
});
