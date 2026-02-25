<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('/lessons6', function () {
        return Inertia::render('Dev/Lessons/Lesson6/index');
    })->name('lessons.lesson6');
});
