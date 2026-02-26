<?php

use App\Http\Controllers\Dev\Lessons\Lesson6Controller;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified'])->prefix('dev')->group(function () {
    Route::resource('lesson6', Lesson6Controller::class)->names([
        'index' => 'lessons6.index',
        'create' => 'lessons6.create',
        'store' => 'lessons6.store',
        'show' => 'lessons6.show',
        'edit' => 'lessons6.edit',
        'update' => 'lessons6.update',
        'destroy' => 'lessons6.destroy',
    ]);
});

//    Route::resource('lessons6', LessonController::class)->names([
//        'index' => 'lessons.index',
//        'create' => 'lessons.create',
//        'store' => 'lessons.store',
//        'show' => 'lessons.show',
//        'edit' => 'lessons.edit',
//        'update' => 'lessons.update',
//        'destroy' => 'lessons.destroy',
//    ]);
