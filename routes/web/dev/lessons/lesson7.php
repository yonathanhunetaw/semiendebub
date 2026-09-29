<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Accessible via: dev.duka.local/lesson7
Route::get('/lesson7', function () {
    return Inertia::render('Dev/Lessons/Lesson7/Index');
})->name('lesson7.index');
