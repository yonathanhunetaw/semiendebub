<?php

use App\Http\Controllers\Shared\SharedCartController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("shared.$baseDomain")
    ->name('shared.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('Shared/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Shared/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });



        // A seller's cart shared with its customer. No login: the link is the
        // key, opens that one cart only, and expires (CartShareService).
        Route::middleware('throttle:60,1')->prefix('c/{token}')->name('cart.')->controller(SharedCartController::class)->group(function () {
            Route::get('/', 'show')->name('show');
            Route::get('/catalogue', 'catalogue')->name('catalogue');
            Route::post('/items', 'add')->name('items.store');
            Route::patch('/items/{variant}', 'update')->whereNumber('variant')->name('items.update');
            Route::post('/checkout', 'checkout')->name('checkout');
            Route::post('/payments/{payment}/claim', 'claim')->whereNumber('payment')->name('payments.claim');
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:shared'])->group(function () {
            Route::get('/dashboard', function () {
                return Inertia::render('Shared/Dashboard/index');
            })->name('dashboard');
        });
    });
