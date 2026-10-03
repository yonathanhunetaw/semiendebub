<?php

use App\Http\Controllers\Delivery\DashboardController;
use App\Http\Controllers\Delivery\DeliveryController;
use App\Http\Controllers\Delivery\FreightController;
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

            // --- LAST-MILE HISTORY ---
            Route::get('/history', [ShipmentController::class, 'index'])->name('history.index');

            // --- INTER-STORE FREIGHT (shared shipment domain) ---
            Route::get('/shipments', [FreightController::class, 'index'])->name('shipments.index');
            Route::get('/shipments/{shipment}', [FreightController::class, 'show'])->name('shipments.show');
            Route::post('/shipments/{shipment}/claim', [FreightController::class, 'claim'])->name('shipments.claim');
            Route::post('/shipments/{shipment}/agree', [FreightController::class, 'agree'])->name('shipments.agree');
            Route::patch('/shipments/{shipment}/status', [FreightController::class, 'transition'])->name('shipments.transition');

            // Transfers between two sites: claim, collect at the origin (the
            // origin dispatches), hand over at the destination.
            Route::get('/transfers', [\App\Http\Controllers\Delivery\TransferController::class, 'index'])->name('transfers.index');
            Route::post('/transfers/{transfer}/claim', [\App\Http\Controllers\Delivery\TransferController::class, 'claim'])->name('transfers.claim');
            Route::post('/transfers/{transfer}/handover', [\App\Http\Controllers\Delivery\TransferController::class, 'handover'])->name('transfers.handover');

            // --- PROFILE ---
            Route::get('/profile', [ProfileController::class, 'index'])->name('profile.index');
            Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
        });
    });
