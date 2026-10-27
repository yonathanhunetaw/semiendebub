<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("stockkeeper.{$baseDomain}")
    ->name('stock_keeper.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('StockKeeper/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('StockKeeper/Login/index');
            })->name('login');
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:stock_keeper'])->group(function () {
            // How Duka works, step by step (shared with the other apps).
            Route::get('/guide', fn (\Illuminate\Http\Request $request) => \Inertia\Inertia::render('Guide/Index', [
                'app' => 'stock_keeper',
                'chapter' => $request->query('chapter'),
                'step' => $request->query('step'),
            ]))->name('guide');
            // The shipments the Guide's 3D world replays (JSON).
            Route::get('/guide/world', \App\Http\Controllers\Shared\GuideWorldController::class)->name('guide.world');
            // The calendar: module dates + reminders and bills (shared with the other apps).
            require base_path('routes/web/partials/calendar.php');
            // Keys, sites, opening/closing, shifts and clock-in (shared with the other apps).
            require base_path('routes/web/partials/work.php');

            // Everything a stock keeper does, shared with the seller app (a seller who is also a
            // stock keeper reaches it under /stock): routes/web/partials/stock-keeping.php.
            require base_path('routes/web/partials/stock-keeping.php');
        });
    });
