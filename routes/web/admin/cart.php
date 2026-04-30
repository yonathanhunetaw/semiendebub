<?php

use App\Http\Controllers\Admin\CartController;
use Illuminate\Support\Facades\Route;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("admin.{$baseDomain}")
    ->middleware(['auth', 'verified', 'role.subdomain:admin'])
    ->prefix('carts')
    ->group(function () {
        Route::get('/', [CartController::class, 'index'])->name('admin.carts.index');
        Route::get('/{id}', [CartController::class, 'show'])->name('admin.carts.show');
        Route::delete('/{id}', [CartController::class, 'destroy'])->name('admin.carts.destroy');

        // If you are using the 'store' method we discussed earlier:
        Route::post('/', [CartController::class, 'store'])->name('admin.carts.store');
    });
