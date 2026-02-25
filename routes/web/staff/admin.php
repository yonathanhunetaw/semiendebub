<?php

use App\Http\Controllers\Admin\ItemController;
use App\Http\Controllers\Admin\LessonController;
use App\Http\Controllers\Admin\SessionController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth', 'verified', 'check_role:Admin'])->prefix('admin')->name('admin.')->group(function () {

    Route::get('/dashboard', function () {
        return Inertia::render('Staff/Admin/Dashboard/index');
    })->name('dashboard');

    Route::resource('items', ItemController::class);

    Route::get('/lessons4', function () {
        return Inertia::render('Dev/Lessons/Lesson4/index');
    })->name('lessons.lesson4');

    Route::resource('lessons6', LessonController::class)->names([
        'index' => 'lessons.index',
        'create' => 'lessons.create',
        'store' => 'lessons.store',
        'show' => 'lessons.show',
        'edit' => 'lessons.edit',
        'update' => 'lessons.update',
        'destroy' => 'lessons.destroy',
    ]);

    Route::prefix('sessions')->group(function () {
        Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
        Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
    });
});
