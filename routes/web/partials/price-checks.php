<?php

declare(strict_types=1);

use App\Http\Controllers\Shared\PriceCheckController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Price checks (shared by seller. and admin.)
|--------------------------------------------------------------------------
| Required from inside each app's authenticated group, so it inherits that
| group's name prefix ({app}.price_checks.*) and middleware. Who may record,
| verify or close is App\Services\Procurement\PriceCheckService's call.
*/

Route::controller(PriceCheckController::class)->prefix('price-checks')->name('price_checks.')->group(function (): void {
    Route::get('/', 'index')->name('index');
    Route::post('/', 'store')->name('store');
    Route::get('/{check}', 'show')->whereNumber('check')->name('show');
    Route::post('/{check}/prices', 'record')->whereNumber('check')->name('record');
    Route::post('/{check}/close', 'close')->whereNumber('check')->name('close');
    Route::post('/prices/{observation}/verify', 'verify')->whereNumber('observation')->name('verify');
    Route::post('/prices/{observation}/reject', 'reject')->whereNumber('observation')->name('reject');
});
