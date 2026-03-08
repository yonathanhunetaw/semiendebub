<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

// --- 1. YOUR EXISTING GROUPS (Admin, Delivery, etc.) ---
Route::domain("admin.{$baseDomain}")->group(function () { /* ... */
});
Route::domain("delivery.{$baseDomain}")->group(function () { /* ... */
});

// --- 2. THE ERROR FIX ---
// Place this at the VERY BOTTOM of your web.php file.
// It acts as a "Catch-All" for any subdomain and any path.
Route::fallback(function () {
    return Inertia::render('Error/Errors/NotFound');
});
