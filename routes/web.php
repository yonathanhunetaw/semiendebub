<?php

use App\Http\Controllers\Admin\ItemController;
use App\Http\Controllers\Admin\SessionController;
use App\Http\Controllers\ProfileController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    if (auth()->check()) {
        return redirect()->route('admin.dashboard');
    }

    return Inertia::render('Welcome', [
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
        'laravelVersion' => Application::VERSION,
        'phpVersion' => PHP_VERSION,
    ]);
});

// Route::get('/dashboard', function () {
//    return Inertia::render('Dashboard');
// })->middleware(['auth', 'verified'])->name('dashboard');

Route::get('/home', function () {
    return Inertia::render('Home', ['name' => 'Mike']); // We can send a second argument as props
})->middleware(['auth', 'verified'])->name('home');

Route::get('/about', function () {
    return inertia::render('About/About');
})->middleware(['auth'], ['verified'])->name('about');

Route::get('/home2', function () {
    return Inertia::render('Home2', ['name' => 'Mike']); // We can send a second argument as props
})->middleware(['auth', 'verified'])->name('home2');

Route::get('/contact', function () {
    //     sleep(3);
    return Inertia::render('Contact');
})->middleware(['auth', 'verified'])->name('contact');
// Route::inertia('/', 'Home'); //->>Also works

Route::get('/homepage', function () {
    return Inertia::render('HomePage');
})->middleware(['auth', 'verified'])->name('homepage');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

Route::middleware(['auth', 'verified'])->group(function () {

    Route::group([
        'prefix' => 'admin',
        'middleware' => 'check_role:Admin', // Ensure this middleware exists!
        'as' => 'admin.',
    ], function () {

        Route::get('/dashboard', function () {
            return Inertia::render('Admin/Dashboard/index');
        })->name('dashboard');

        Route::resource('items', ItemController::class);

        // Session management routes
        Route::prefix('sessions')->group(function () {
            Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
            Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
        });

        // Add your other admin routes (users, items, etc.) here later
    });

});

require __DIR__.'/auth.php';
