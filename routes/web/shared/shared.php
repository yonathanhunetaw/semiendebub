<?php

use App\Http\Controllers\Stockkeeper\MenuController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain('shared.duka.local')
    ->name('shared.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::get('/', function () {
                return Inertia::render('Shared/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Shared/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:shared'])->group(function () {
            Route::get('/dashboard', function () {
                return Inertia::render('Shared/Dashboard/index');
            })->name('dashboard');

            Route::get('/', [MenuController::class, 'index'])->name('sessions.index');
        });
    });
