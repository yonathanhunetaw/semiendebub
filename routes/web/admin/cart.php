<?php

use App\Http\Controllers\Admin\CartController;
use Illuminate\Support\Facades\Route;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("admin.{$baseDomain}")
    ->middleware(['auth', 'verified', 'role.subdomain:admin', 'admin.store'])
    ->prefix('carts') // Everything inside this group starts with /carts
    ->group(function () {
        Route::get('/', [CartController::class, 'index'])->name('admin.carts.index');

        // FIX: Just use '/' or 'create' because 'carts' is already prefixed
        Route::get('/create', [CartController::class, 'create'])->name('admin.carts.create');
        Route::post('/', [CartController::class, 'store'])->name('admin.carts.store');

        // {cart}, not {id}: show() type-hints Cart, and an unmatched name
        // bound an empty model.
        Route::get('/{cart}', [CartController::class, 'show'])->name('admin.carts.show');
        Route::delete('/{id}', [CartController::class, 'destroy'])->name('admin.carts.destroy');
    });
