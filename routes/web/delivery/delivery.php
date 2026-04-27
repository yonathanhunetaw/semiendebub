<?php

use App\Http\Controllers\Delivery\SessionController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("delivery.{$baseDomain}")
    ->name('delivery.')
    ->group(function () {

        // Guest Routes
        Route::middleware(['guest.subdomain.login'])->group(function () {
            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('Delivery/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Delivery/Login/index');
            })->name('login');
        });

        // Protected Routes
        Route::middleware(['auth', 'verified', 'role.subdomain:delivery'])->group(function () {

            Route::get('/dashboard', function () {
                return Inertia::render('Delivery/Dashboard/index');
            })->name('dashboard');

            // --- SESSION ROUTES ---
            Route::prefix('sessions')->group(function () {
                Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
                Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
            });

            Route::get('/delivery', function () {
                return Inertia::render('Delivery/Delivery/index');
            })->name('delivery.index');

            Route::get('/shipments', function () {
                return Inertia::render('Delivery/Shipments/index');
            })->name('shipments.index');

            // Added this so your Profile button has a destination!
            Route::get('/profile', function () {
                return Inertia::render('Delivery/Profile/index');
            })->name('profile.index');
        });
    });
