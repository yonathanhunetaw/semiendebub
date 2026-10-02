<?php

use App\Http\Controllers\Dev\LibraryController;
use App\Http\Controllers\Dev\LogViewerController;
use App\Http\Controllers\Dev\SessionController;
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

            // Live log viewer -> dev.<domain>/logs
            Route::prefix('logs')->name('logs.')->group(function (): void {
                Route::get('/', [LogViewerController::class, 'index'])->name('index');
                Route::get('/fetch', [LogViewerController::class, 'fetch'])->name('fetch');
                Route::post('/clear', [LogViewerController::class, 'clear'])->name('clear');
            });

            // Dependency inventory -> dev.<domain>/libraries
            Route::prefix('libraries')->name('libraries.')->group(function (): void {
                Route::get('/', [LibraryController::class, 'index'])->name('index');
                Route::post('/refresh', [LibraryController::class, 'refresh'])->name('refresh');
            });

            /*
            |--------------------------------------------------------------------------
            | Modular Dev & Lesson Imports
            |--------------------------------------------------------------------------
            | Including these files here ensures they inherit the 'dev.' subdomain,
            | naming prefixes, and all required authentication middleware layers.
            */
            require __DIR__ . '/lessons/lesson4.php';
            require __DIR__ . '/lessons/lesson6.php';
            require __DIR__ . '/lessons/lesson7.php';

            // Domain Module Visualizer -> dev.<domain>/architecture
            require __DIR__ . '/architecture.php';
        });
    });

/*
|--------------------------------------------------------------------------
| Local-only path mount: /dev/architecture
|--------------------------------------------------------------------------
| The subdomain group above requires the dev host + an authenticated dev role.
| While developing we also want the visualizer reachable on the plain host at
| /dev/architecture. ArchitectureController aborts with a 404 outside
| local/development, so this mount never exposes anything in production.
*/

if (app()->environment(['local', 'development', 'testing'])) {
    Route::prefix('dev')
        ->name('dev.local.')
        ->group(function (): void {
            require __DIR__ . '/architecture.php';
        });
}
