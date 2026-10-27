<?php

declare(strict_types=1);

use App\Http\Controllers\Admin\ImpersonationController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| The Role Switcher: an admin moves between apps without a password
|--------------------------------------------------------------------------
| Registered on every role host, because the switch starts wherever the admin
| is (the banner on an opened app can switch again) and ends on the target
| host, where the new session is created or dropped. ImpersonationController
| decides who may do what from the real admin behind the session.
*/

$baseDomain = config('app.system_domain', 'duka.local');

foreach (array_keys(config('subdomains.subdomains', [])) as $subdomain) {
    Route::domain("{$subdomain}.{$baseDomain}")
        ->prefix('impersonate')->name("{$subdomain}.impersonate.")
        ->group(function () {
            Route::middleware('auth')->group(function () {
                Route::get('/users', [ImpersonationController::class, 'users'])->name('users');
                Route::post('/', [ImpersonationController::class, 'start'])->name('start');
                Route::post('/stop', [ImpersonationController::class, 'stop'])->name('stop');
            });
            Route::get('/{token}', [ImpersonationController::class, 'enter'])->where('token', '[A-Za-z0-9]{48}')->name('enter');
        });
}
