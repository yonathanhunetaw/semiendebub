<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("procurement.{$baseDomain}")
    ->name('procurement.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            // Added a root route so typing the domain doesn't 404
            Route::get('/', function () {
                return Inertia::render('Procurement/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Procurement/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:procurement'])->group(function () {
            Route::get('/dashboard', function () {
                return Inertia::render('Procurement/Dashboard/index');
            })->name('dashboard');

            // Example future route
            Route::get('/purchase-orders', function () {
                return Inertia::render('Procurement/PurchaseOrders/index');
            })->name('purchase_orders.index');

        });
    });
