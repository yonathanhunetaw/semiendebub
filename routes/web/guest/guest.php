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

    $baseDomain = config('app.system_domain'); // mezgebedirijit.com
    $subdomain = str_replace('.'.$baseDomain, '', $host);

    $hostToRole = [
        'admin' => 'admin',
        'delivery' => 'delivery',
        'dev' => 'dev',
        'finance' => 'finance',
        'guest' => 'guest',
        'marketing' => 'marketing',
        'procurement' => 'procurement',
        'seller' => 'seller',
        'shared' => 'shared',
        'stockkeeper' => 'stock_keeper',
        'vendor' => 'vendor',
    ];

    if (isset($hostToRole[$subdomain])) {

        $expectedRole = $hostToRole[$subdomain];

        if (! $user || ! $user->hasRole($expectedRole)) {

            $hostToWelcome = [
                'admin' => 'Welcome/Admin',
                'delivery' => 'Welcome/Delivery',
                'dev' => 'Welcome/Dev',
                'finance' => 'Welcome/Finance',
                'guest' => 'Welcome/Guest',
                'marketing' => 'Welcome/Marketing',
                'procurement' => 'Welcome/Procurement',
                'seller' => 'Welcome/Seller',
                'shared' => 'Welcome/Shared',
                'stockkeeper' => 'Welcome/StockKeeper',
                'vendor' => 'Welcome/Vendor',
            ];

            return Inertia::render($hostToWelcome[$subdomain]);
        }

        $roleDashboards = [
            'admin' => 'admin.dashboard',
            'delivery' => 'delivery.dashboard',
            'dev' => 'dev.dashboard',
            'finance' => 'finance.dashboard',
            'guest' => 'guest.dashboard',
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
