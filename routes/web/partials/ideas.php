<?php

declare(strict_types=1);

use App\Http\Controllers\Shared\ProductIdeaController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Product ideas (shared by seller., admin. and procurement.)
|--------------------------------------------------------------------------
| Required from inside each app's authenticated group, so it inherits that
| group's name prefix ({app}.ideas.*) and middleware. Who sees and moves
| what is App\Services\Procurement\ProductIdeaService's call.
*/

Route::controller(ProductIdeaController::class)->prefix('ideas')->name('ideas.')->group(function (): void {
    Route::get('/', 'index')->name('index');
    Route::post('/', 'store')->name('store');
    Route::post('/{idea}/move', 'move')->whereNumber('idea')->name('move');
});
