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
Route::fallback(function (\Illuminate\Http\Request $request) {
    // Render the page AND send a real 404. Returning the Inertia response
    // directly answered every unknown URL with HTTP 200, so crawlers, uptime
    // checks and tests all saw a missing page as a success.
    return Inertia::render('Error/Errors/NotFound')
        ->toResponse($request)
        ->setStatusCode(404);
});
