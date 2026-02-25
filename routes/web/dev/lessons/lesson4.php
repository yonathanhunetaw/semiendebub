<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('/lessons4', function () {
        return Inertia::render('Dev/Lessons/Lesson4/index');
    })->name('lessons.lesson4');
});
