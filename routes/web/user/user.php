<?php

use App\Http\Controllers\Admin\SessionController;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware('notify.public.visit')->get('/', function () {

    $user = Auth::user();
    $host = request()->getHost();

    $baseDomain = config('subdomains.base_domain');
    $subdomain = str_replace('.'.$baseDomain, '', $host);

    $subdomains = config('subdomains.subdomains', []);
    $aliases = config('subdomains.aliases', []);
    $canonicalSubdomain = $aliases[$subdomain] ?? $subdomain;

    if (isset($subdomains[$canonicalSubdomain])) {

        $expectedRole = $subdomains[$canonicalSubdomain]['role'];

        if (! $user || ! $user->hasRole($expectedRole)) {
            return Inertia::render($subdomains[$canonicalSubdomain]['welcome_component']);
        }

        $roleDashboards = [
            'admin' => 'admin.dashboard',
            'delivery' => 'delivery.dashboard',
            'dev' => 'dev.dashboard',
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

    if ($user) {
        $primaryRole = $user->roles->pluck('name')->first();
        $targetHost = null;
        foreach (config('subdomains.host_role_map', []) as $mappedHost => $mappedRole) {
            if ($mappedRole === $primaryRole) {
                $targetHost = $mappedHost;
                break;
            }
        }
        if ($targetHost) {
            $protocol = request()->isSecure() ? 'https://' : 'http://';
            $port = request()->getPort();
            $portSuffix = ($port && !in_array($port, [80, 443])) ? ":{$port}" : "";
            return redirect()->to($protocol . $targetHost . $portSuffix . '/dashboard');
        }
    }

    return Inertia::render('User/Welcome/index');
});

if (app()->environment('local')) {
    Route::get('/glitchtip-test', function () {
        // This fires a log event that also gets captured by GlitchTip
        \Illuminate\Support\Facades\Log::error('GlitchTip test log warning triggered prior to exception.', [
            'host' => request()->getHost(),
        ]);

        // This triggers the 500 exception
        throw new \Exception('GlitchTip test error on host: ' . request()->getHost());
    })->name('glitchtip.test');
}

Route::middleware(['auth', 'verified', 'guest.subdomain'])->group(function () {

    Route::get('/home', function () {
        return Inertia::render('User/Home/index', ['name' => 'Mike']);
    })->name('home');

    Route::get('/home2', function () {
        return Inertia::render('User/Home2/index', ['name' => 'Mike']);
    })->name('home2');

    Route::get('/contact', function () {
        return Inertia::render('User/Contact/index');
    })->name('contact');

    Route::get('/about', function () {
        return Inertia::render('User/About/index');
    })->name('about');

    Route::get('/homepage', function () {
        return Inertia::render('User/HomePage/index');
    })->name('homepage');

    // Guest/Dashboard/index is now the public storefront and needs catalogue
    // props, so this authenticated entry point shares the storefront
    // controller. The unauthenticated door is `storefront.index` (/shop).
    // Named `dashboard` because that is the name the auth scaffolding
    // (register / verify email / confirm password) and AuthenticatedLayout all
    // resolve. It did not exist, so every one of those paths threw
    // RouteNotFoundException and returned a 500.
    Route::get('/dashboard', [\App\Http\Controllers\Storefront\StorefrontController::class, 'index'])
        ->name('dashboard');

    // --- PROFILE (main domain) ---
    // Shared\ProfileController existed but was routed nowhere, so account
    // self-service was unreachable outside the delivery and vendor consoles.
    Route::get('/profile', [\App\Http\Controllers\Shared\ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [\App\Http\Controllers\Shared\ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [\App\Http\Controllers\Shared\ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::prefix('sessions')->group(function () {
        Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
        Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
    });
});