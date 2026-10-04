<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Session management (shared by admin. and dev.)
|--------------------------------------------------------------------------
| Required from inside each subdomain's authenticated group, so it inherits
| that group's name prefix (admin.sessions.* / dev.sessions.*) and middleware.
| The including file sets $sessionController to the controller for its host.
|
| Static segments are registered before /{id}, otherwise "terminate-all"
| would be captured as a session id.
*/

/** @var class-string $sessionController */
Route::prefix('sessions')->name('sessions.')->group(function () use ($sessionController): void {
    Route::get('/', [$sessionController, 'index'])->name('index');

    Route::post('/extend-all', [$sessionController, 'extendAll'])->name('extendAll');
    Route::post('/extend-selected', [$sessionController, 'extendSelected'])->name('extendSelected');
    Route::delete('/terminate-all', [$sessionController, 'destroyAll'])->name('destroyAll');
    Route::delete('/terminate-selected', [$sessionController, 'destroySelected'])->name('destroySelected');
    Route::delete('/users/{user}', [$sessionController, 'destroyUser'])->whereNumber('user')->name('destroyUser');

    Route::post('/{id}/extend', [$sessionController, 'extend'])->name('extend');
    Route::post('/{id}/reset', [$sessionController, 'reset'])->name('reset');
    Route::delete('/{id}', [$sessionController, 'destroy'])->name('destroy');
});
