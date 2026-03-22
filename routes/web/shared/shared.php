<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("shared.$baseDomain")
    ->name('shared.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::get('/', function () {
                return Inertia::render('Welcome/Shared');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Shared/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        Route::get('/debug-host', function () {
            return [
                'host' => request()->getHost(),
                'expected' => config('app.system_domain'),
            ];
        });

        Route::get('/debug-middleware', function () {
            return request()->route()->gatherMiddleware();
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:shared'])->group(function () {
            Route::get('/dashboard', function () {
                return Inertia::render('Shared/Dashboard/index');
            })->name('dashboard');
        });
    });
