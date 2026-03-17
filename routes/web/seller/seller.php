<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("seller.$baseDomain")
    ->name('seller.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::get('/', function () {
                return Inertia::render('Seller/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Seller/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:seller'])->group(function () {
            Route::get('/dashboard', function () {
                return Inertia::render('Seller/Dashboard/index');
            })->name('dashboard');

            // Example future route
            Route::get('/orders', function () {
                return Inertia::render('Seller/Orders/index');
            })->name('orders.index');
        });
    });
