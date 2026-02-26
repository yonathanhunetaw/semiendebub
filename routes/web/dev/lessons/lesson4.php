<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth', 'verified'])->prefix('dev')->group(function () {
    Route::get('/lesson4', function () {
        return Inertia::render('Dev/Lessons/Lesson4/index');
    })->name('lesson4.index');
});
