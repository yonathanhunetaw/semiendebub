<?php

use App\Http\Controllers\Admin\CartController;
use Illuminate\Support\Facades\Route;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("admin.{$baseDomain}")
    ->middleware(['auth', 'verified', 'role.subdomain:admin'])
    ->prefix('carts') // Everything inside this group starts with /carts
    ->group(function () {
        Route::get('/', [CartController::class, 'index'])->name('admin.carts.index');

        // FIX: Just use '/' or 'create' because 'carts' is already prefixed
        Route::get('/create', [CartController::class, 'create'])->name('admin.carts.create');
        Route::post('/', [CartController::class, 'store'])->name('admin.carts.store');

        Route::get('/{id}', [CartController::class, 'show'])->name('admin.carts.show');
        Route::delete('/{id}', [CartController::class, 'destroy'])->name('admin.carts.destroy');
    });
