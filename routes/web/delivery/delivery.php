<?php

use App\Http\Controllers\Admin\SessionController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("delivery.{$baseDomain}")
    ->name('delivery.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            // Added a root route so typing the domain doesn't 404
            Route::get('/', function () {
                return Inertia::render('Delivery/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Delivery/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        // 2. Protected Routes (Auth and Role needed)
        Route::middleware(['auth', 'verified', 'role.subdomain:delivery'])->group(function () {

            Route::get('/dashboard', function () {
                return Inertia::render('Delivery/Dashboard/index');
            })->name('dashboard');

            Route::get('/delivery', function () {
                return Inertia::render('Delivery/delivery/index');
            })->name('delivery.index');

            Route::get('/shipments', function () {
                return Inertia::render('Delivery/Shipments/index');
            })->name('shipments.index');

            Route::prefix('sessions')->group(function () {
                Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
                Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
            });
        });
    });
