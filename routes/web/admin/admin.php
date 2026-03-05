<?php

//
// use App\Http\Controllers\Admin\ItemController;
// use App\Http\Controllers\Admin\SessionController;
// use Illuminate\Support\Facades\Route;
// use Inertia\Inertia;
//
// Route::middleware(['auth', 'verified', 'check_role:Admin'])->prefix('admin')->name('admin.')->group(function () {
//
//    Route::get('/dashboard', function () {
//        return Inertia::render('Admin/Dashboard/index');
//    })->name('dashboard');
//
//    Route::resource('items', ItemController::class);
//
//    Route::prefix('sessions')->group(function () {
//        Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
//        Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
//    });
// });
//

use App\Http\Controllers\Admin\ItemController;
use App\Http\Controllers\Admin\SessionController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

/*
|--------------------------------------------------------------------------
| Admin Routes (Domain Specific)
|--------------------------------------------------------------------------
|
| All routes for the admin panel are under admin.duka.local
|
*/

Route::domain('admin.duka.local')
    ->middleware(['auth', 'verified', 'role.subdomain:admin'])
    ->name('admin.')
    ->group(function () {
        Route::get('/dashboard', function () {
            return Inertia::render('Admin/Dashboard/index');
        })->name('dashboard');

        Route::resource('items', ItemController::class);

        Route::prefix('sessions')->group(function () {
            Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
            Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
        });
    });
