<?php

use App\Http\Controllers\Dev\Lessons\Lesson6Controller;
use Illuminate\Support\Facades\Route;

// Automatically inherits domain, auth, and 'dev.' name prefix
Route::resource('lesson6', Lesson6Controller::class)->names([
    'index'   => 'lesson6.index',
    'create'  => 'lesson6.create',
    'store'   => 'lesson6.store',
    'show'    => 'lesson6.show',
    'edit'    => 'lesson6.edit',
    'update'  => 'lesson6.update',
    'destroy' => 'lesson6.destroy',
]);
