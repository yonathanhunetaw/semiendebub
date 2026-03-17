<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("marketing.$baseDomain")
    ->name('marketing.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::get('/', function () {
                return Inertia::render('Welcome/Marketing');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Marketing/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:marketing'])->group(function () {
            Route::get('/dashboard', function () {
                return Inertia::render('Marketing/Dashboard/index');
            })->name('dashboard');

            // Example future route
            Route::get('/campaigns', function () {
                return Inertia::render('Marketing/Campaigns/index');
            })->name('campaigns.index');
        });
    });
