<?php

use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Route::get('/', function () {
//    if (auth()->check()) {
//        return redirect()->route('admin.dashboard');
//    }
//
//    return Inertia::render('Guest/Welcome', [
//        'canLogin' => Route::has('login'),
//        'canRegister' => Route::has('register'),
//        'laravelVersion' => Application::VERSION,
//        'phpVersion' => PHP_VERSION,
//    ]);
// });

Route::get('/', function () {
    $user = Auth::user();

    if ($user) {
        // Redirect based on role
        if ($user->hasRole('admin')) {
            return redirect()->route('admin.dashboard');
        }
        if ($user->hasRole('seller')) {
            return redirect()->route('seller.dashboard');
        }
        if ($user->hasRole('stock_keeper')) {
            return redirect()->route('stock_keeper.dashboard');
        }
        if ($user->hasRole('user')) {
            return redirect()->route('user.home');
        }

        // fallback
        return Inertia::render('Guest/Welcome');

    }

    // Guest view
    return Inertia::render('Guest/Welcome', [
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
        'laravelVersiostoresn' => Application::VERSION,
        'phpVersion' => PHP_VERSION,
    ]);
});

Route::middleware(['auth', 'verified'])->group(function () {

    Route::get('/home', function () {
        return Inertia::render('Guest/Home', ['name' => 'Mike']);
    })->name('home');

    Route::get('/home2', function () {
        return Inertia::render('Guest/Home2', ['name' => 'Mike']);
    })->name('home2');

    Route::get('/contact', function () {
        return Inertia::render('Guest/Contact');
    })->name('contact');

    Route::get('/about', function () {
        return Inertia::render('Guest/About');
    })->name('about');

    Route::get('/homepage', function () {
        return Inertia::render('Guest/HomePage');
    })->name('homepage');
});
