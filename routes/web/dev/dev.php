<?php

use App\Http\Controllers\Admin\SessionController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("dev.{$baseDomain}")
    ->name('dev.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::get('/', function () {
                return Inertia::render('Dev/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Dev/Login/index');
            })->name('login');
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:dev'])->group(function () {
            Route::get('/dashboard', function () {
                return Inertia::render('Dev/Dashboard/index');
            })->name('dashboard');

            Route::get('/shipments', function () {
                return Inertia::render('Dev/Shipments/index');
            })->name('shipments.index');

            Route::prefix('sessions')->group(function () {
                Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
                Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
            });
        });
    });
