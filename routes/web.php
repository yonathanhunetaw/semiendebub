<?php

use App\Http\Controllers\ProfileController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use App\Http\Controllers\Admin\SessionController;

Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
        'laravelVersion' => Application::VERSION,
        'phpVersion' => PHP_VERSION,
    ]);
});

Route::get('/dashboard', function () {
    return Inertia::render('Dashboard');
})->middleware(['auth', 'verified'])->name('dashboard');

Route::get('/home', function () {
    return Inertia::render('Home');
})->middleware(['auth', 'verified'])->name('home');

Route::get('/about', function (){
    return inertia::render('About/About');
})->middleware(['auth'], ['verified'])->name('about');

Route::get('/homepage', function () {
    return Inertia::render('HomePage');
})->middleware(['auth', 'verified'])->name('homepage');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

Route::middleware(['auth', 'verified'])->group(function () {
    
    // Put your Admin Group back here!
    Route::group([
        'prefix' => 'admin',
        'middleware' => 'check_role:Admin', // Ensure this middleware exists!
        'as' => 'admin.',
    ], function () {
        
        // Session management routes
        Route::prefix('sessions')->group(function () {
            Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
            Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
        });

        // Add your other admin routes (users, items, etc.) here later
    });
});

require __DIR__.'/auth.php';
