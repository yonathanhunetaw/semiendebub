<?php

use App\Http\Controllers\Admin\SessionController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("dev.{$baseDomain}")
    ->name('dev.')
    ->group(function () {

        // 1. Guest Routes
        Route::middleware(['guest.subdomain.login'])->group(function () {
            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('Dev/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Dev/Login/index');
            })->name('login');
        });

        // 2. Authenticated Dashboard & Workspace Routes
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

            /*
            |--------------------------------------------------------------------------
            | Modular Dev & Lesson Imports
            |--------------------------------------------------------------------------
            | Including these files here ensures they inherit the 'dev.' subdomain,
            | naming prefixes, and all required authentication middleware layers.
            */
            require __DIR__.'/web/dev/dev.php';
            require __DIR__.'/web/dev/lessons/lesson4.php';
            require __DIR__.'/web/dev/lessons/lesson6.php';

        });
    });
