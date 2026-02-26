<?php

use App\Http\Controllers\Staff\Admin\ItemController;
use App\Http\Controllers\Staff\Admin\SessionController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth', 'verified', 'check_role:Admin'])->prefix('admin')->name('admin.')->group(function () {

    Route::get('/dashboard', function () {
        return Inertia::render('Staff/Admin/Dashboard/index');
    })->name('dashboard');

    Route::resource('items', ItemController::class);

    Route::prefix('sessions')->group(function () {
        Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
        Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
    });
});
