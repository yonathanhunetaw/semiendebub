<?php

use App\Http\Controllers\Delivery\DashboardController;
use App\Http\Controllers\Delivery\DeliveryController;
use App\Http\Controllers\Delivery\ProfileController;
use App\Http\Controllers\Delivery\SessionController;
use App\Http\Controllers\Delivery\ShipmentController;
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

            Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

            // --- SESSION ROUTES ---
            Route::prefix('sessions')->group(function () {
                Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
                Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
            });

            // --- ACTIVE RUNS ---
            Route::get('/delivery', [DeliveryController::class, 'index'])->name('delivery.index');
            Route::post('/delivery/{delivery}/claim', [DeliveryController::class, 'claim'])->name('delivery.claim');
            Route::patch('/delivery/{delivery}/status', [DeliveryController::class, 'transition'])->name('delivery.transition');

            // --- HISTORY ---
            Route::get('/shipments', [ShipmentController::class, 'index'])->name('shipments.index');

            // --- PROFILE ---
            Route::get('/profile', [ProfileController::class, 'index'])->name('profile.index');
            Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
        });
    });
