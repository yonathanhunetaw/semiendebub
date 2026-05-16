<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Accessible via: dev.duka.local/lesson4
Route::get('/lesson4', function () {
    return Inertia::render('Dev/Lessons/Lesson4/index');
})->name('lesson4.index');
