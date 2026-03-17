<?php

use App\Http\Controllers\Admin\SessionController;
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
    $host = request()->getHost();

    $hostToRole = [
        'admin.duka.local' => 'admin',
        'delivery.duka.local' => 'delivery',
        'dev.duka.local' => 'dev',
        'finance.duka.local' => 'finance',
        'guest.duka.local' => 'guest',
        'marketing.duka.local' => 'marketing',
        'procurement.duka.local' => 'procurement',
        'seller.duka.local' => 'seller',
        'shared.duka.local' => 'shared',
        'stockkeeper.duka.local' => 'stock_keeper',
        'vendor.duka.local' => 'vendor',
    ];

    if (isset($hostToRole[$host])) {

        $expectedRole = $hostToRole[$host];

        if (! $user || ! $user->hasRole($expectedRole)) {

            $hostToWelcome = [
                'admin.duka.local' => 'Welcome/Admin',
                'delivery.duka.local' => 'Welcome/Delivery',
                'dev.duka.local' => 'Welcome/Dev',
                'finance.duka.local' => 'Welcome/Finance',
                'guest.duka.local' => 'Welcome/Guest',
                'marketing.duka.local' => 'Welcome/Marketing',
                'procurement.duka.local' => 'Welcome/Procurement',
                'seller.duka.local' => 'Welcome/Seller',
                'shared.duka.local' => 'Welcome/Shared',
                'stockkeeper.duka.local' => 'Welcome/StockKeeper',
                'vendor.duka.local' => 'Welcome/Vendor',
            ];

            return Inertia::render($hostToWelcome[$host]);
        }

        $roleDashboards = [
            'admin' => 'admin.dashboard',
            'delivery' => 'delivery.dashboard',
            'finance' => 'finance.dashboard',
            'marketing' => 'marketing.dashboard',
            'procurement' => 'procurement.dashboard',
            'seller' => 'seller.dashboard',
            'shared' => 'shared.dashboard',
            'stock_keeper' => 'stock_keeper.dashboard',
            'vendor' => 'vendor.dashboard',
        ];

        return redirect()->route($roleDashboards[$expectedRole]);
    }

    return Inertia::render('Guest/Welcome');
});

Route::middleware(['auth', 'verified', 'guest.subdomain'])->group(function () {

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

    Route::prefix('sessions')->group(function () {
        Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
        Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
    });
});
