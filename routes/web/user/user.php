<?php

declare(strict_types=1);

use App\Http\Controllers\Admin\SessionController;
use App\Http\Controllers\Storefront\CartController;
use App\Http\Controllers\Storefront\SeoController;
use App\Http\Controllers\Storefront\StorefrontController;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware('notify.public.visit')->get('/', function () {

    $user = Auth::user();$host = request()->getHost();

    $baseDomain = config('subdomains.base_domain');$subdomain = str_replace('.'.$baseDomain, '',$host);

    $subdomains = config('subdomains.subdomains', []);$aliases = config('subdomains.aliases', []);
    $canonicalSubdomain =$aliases[$subdomain] ?? $subdomain;

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

    if ($user) {$primaryRole = $user->roles->pluck('name')->first();$targetHost = null;
        foreach (config('subdomains.host_role_map', []) as $mappedHost =>$mappedRole) {
            if ($mappedRole ===$primaryRole) {
                $targetHost =$mappedHost;
                break;
            }
        }
        if ($targetHost) {
            $protocol = request()->isSecure() ? 'https://' : 'http://';$port = request()->getPort();
            $portSuffix = ($port && !in_array($port, [80, 443])) ? ":{$port}" : "";
            return redirect()->to($protocol . $targetHost .$portSuffix . '/dashboard');
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

/*
|--------------------------------------------------------------------------
| Public Storefront
|--------------------------------------------------------------------------
|
| Deliberately unauthenticated. Shoppers browse and fill a cart as guests;
| the cart is keyed to their session id and adopted by their account at
| sign-in via CartService::mergeGuestCart(). Only checkout is gated.
|
*/

Route::get('/sitemap.xml', [SeoController::class, 'sitemap'])->name('seo.sitemap');
Route::get('/robots.txt', [SeoController::class, 'robots'])->name('seo.robots');

Route::get('/shop', [StorefrontController::class, 'index'])
    ->middleware('throttle:120,1')
    ->name('storefront.index');

// Product detail: where the shopper picks a variant before adding to cart.
Route::get('/shop/items/{item}', [StorefrontController::class, 'show'])
    ->name('storefront.items.show');

// Every store on Duka, and one search across all of them (the marketplace).
Route::get('/stores', [\App\Http\Controllers\Storefront\MarketplaceController::class, 'index'])
    ->middleware('throttle:60,1')
    ->name('storefront.stores');

// A store's own shop (vendor V0: a vendor is a store). Same pages as /shop,
// for the store whose public slug is in the address; /shop stays the default.
Route::get('/s/{store}', [StorefrontController::class, 'index'])
    ->where('store', '[a-z0-9]+(?:-[a-z0-9]+)*')
    ->middleware('throttle:120,1')
    ->name('storefront.store');

// A shopper who received an order from the store rates it (StoreReviews).
Route::post('/s/{store}/reviews', [\App\Http\Controllers\Storefront\StoreReviewController::class, 'store'])
    ->where('store', '[a-z0-9]+(?:-[a-z0-9]+)*')
    ->middleware(['auth', 'throttle:10,1'])
    ->name('storefront.store.reviews.store');

Route::get('/s/{store}/items/{item}', [StorefrontController::class, 'show'])
    ->where('store', '[a-z0-9]+(?:-[a-z0-9]+)*')
    ->name('storefront.store.items.show');

Route::prefix('shop/cart')->middleware('throttle:60,1')->name('storefront.cart.')->group(function (): void {
    Route::post('/items', [CartController::class, 'store'])->name('items.store');
    Route::patch('/items/{variant}', [CartController::class, 'update'])->name('items.update');
    Route::delete('/items/{variant}', [CartController::class, 'destroy'])->name('items.destroy');
});

// Every store's cart in the basket at once: one order per store.
Route::post('/shop/checkout-all', [CartController::class, 'checkoutAll'])
    ->middleware('throttle:20,1')
    ->name('storefront.checkout.all');

Route::post('/shop/checkout', [CartController::class, 'checkout'])
    ->middleware('throttle:20,1')
    ->name('storefront.checkout');

// After the cart: the checkout page, placing the orders, and the shopper's own orders
// (pay by transfer, "I've sent it", follow, cancel while unpaid). OnlineOrderService.
Route::middleware('auth')->controller(\App\Http\Controllers\Storefront\OnlineOrderController::class)->group(function (): void {
    Route::get('/shop/checkout', 'checkout')->name('storefront.checkout.show');
    Route::post('/shop/checkout/place', 'place')->middleware('throttle:10,1')->name('storefront.checkout.place');
    Route::get('/shop/orders', 'index')->name('storefront.orders.index');
    Route::get('/shop/orders/{sale:reference_number}', 'show')->name('storefront.orders.show');
    Route::post('/shop/orders/{sale:reference_number}/payments/{payment}/sent', 'claim')->middleware('throttle:20,1')->whereNumber('payment')->name('storefront.orders.claim');
    Route::post('/shop/orders/{sale:reference_number}/cancel', 'cancel')->middleware('throttle:10,1')->name('storefront.orders.cancel');
});


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

    Route::get('/dashboard', [StorefrontController::class, 'index'])
        ->name('dashboard');

    // --- PROFILE (main domain) ---
    Route::get('/profile', [\App\Http\Controllers\Shared\ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [\App\Http\Controllers\Shared\ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [\App\Http\Controllers\Shared\ProfileController::class, 'destroy'])->name('profile.destroy');

    // Lists and ends every user's session
    Route::prefix('sessions')->middleware(['role:admin', 'admin.global'])->group(function () {
        Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
        Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
    });
});

/*
- The counter QR's URL (App\Services\Workforce\CounterQr::url). It is on the
- root domain because sellers and stock keepers sign in to different apps;
- the page sends the phone on to `{app}.work.clock` and remembers the choice.
 */
Route::get('/clock/{site}/{token}', \App\Http\Controllers\Shared\Work\ClockRelayController::class)
    ->whereNumber('site')
    ->name('clock.relay');