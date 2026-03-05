<?php

use App\Http\Controllers\Admin\Client\Customer\CustomerController;
use Illuminate\Support\Facades\Route;

Route::domain('admin.duka.local')
    ->middleware(['auth', 'verified', 'role.subdomain:admin'])
    ->prefix('customers')
    ->group(function () {
        Route::get('/', [CustomerController::class, 'index'])->name('store.index');
        Route::get('/create', [CustomerController::class, 'create'])->name('store.create');
        Route::post('/', [CustomerController::class, 'store'])->name('store.store');
        Route::get('/{store}/edit', [CustomerController::class, 'edit'])->name('store.edit');
        Route::patch('/{store}', [CustomerController::class, 'update'])->name('store.update');
        Route::delete('/{store}', [CustomerController::class, 'destroy'])->name('store.destroy');
    });
