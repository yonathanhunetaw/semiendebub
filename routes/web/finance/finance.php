<?php

use App\Http\Controllers\Admin\SessionController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("finance.{$baseDomain}")
    ->name('finance.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            // Added a root route so typing the domain doesn't 404
            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('Welcome/Finance');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Finance/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:finance'])->group(function () {
            Route::get('/dashboard', function () {
                return Inertia::render('Finance/Dashboard/index');
            })->name('dashboard');

            // Example future route
            Route::get('/reports', function () {
                return Inertia::render('Finance/Reports/index');
            })->name('reports.index');

            Route::prefix('sessions')->group(function () {
                Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
                Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
            });
        });
    });
