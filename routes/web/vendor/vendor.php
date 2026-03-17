<?php

use App\Http\Controllers\Stockkeeper\MenuController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("vendor.$baseDomain")
    ->name('vendor.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::get('/', function () {
                return Inertia::render('Welcome/Vendor');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Vendor/Login/index');
            })->name('login');
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:vendor'])->group(function () {
            Route::get('/dashboard', function () {
                return Inertia::render('Vendor/Dashboard/index');
            })->name('dashboard');

            Route::get('/', [MenuController::class, 'index'])->name('sessions.index');
        });
    });
