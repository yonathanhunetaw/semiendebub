<?php

use App\Http\Controllers\Admin\ItemController;
use App\Http\Controllers\Admin\SessionController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("admin.{$baseDomain}")
    ->name('admin.')
    ->group(function () {

        // Added 'Allow Subdomain  Login' so logged-in users don't see the login form
        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Admin/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:admin'])->group(function () {

            Route::get('/dashboard', function () {
                return Inertia::render('Admin/Dashboard/index');
            })->name('dashboard');

            Route::get('/settings', function () {
                return Inertia::render('Admin/Settings/Index');
            })->name('settings');

            // Backwards-compatible URL (if you navigate to /admin/settings on the admin subdomain)
            Route::get('/admin/settings', function () {
                return redirect()->route('admin.settings');
            });

            Route::resource('items', ItemController::class);

            Route::prefix('sessions')->group(function () {
                Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
                Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
            });
        });
    });

// Route::domain('/')
//    ->name('admin.')
//    ->group(function () {
//
//        // Added 'AllowSubdomainLogin' so logged-in users don't see the login form
//        Route::middleware(['auth', 'verified', 'role.subdomain:admin'])->group(function () {
//
//            Route::get('/', function () {
//                return Inertia::render('Admin/Dashboard/index');
//            })->name('dashboard');
//
//        });
//    });
