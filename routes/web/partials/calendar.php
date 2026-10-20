<?php

/*
 * The calendar, required inside an app's authenticated group (admin, seller,
 * stock keeper, delivery, procurement), so it sits behind that app's role
 * gate and its names take the app's prefix: `seller.calendar`,
 * `seller.calendar.feed`… CalendarController reads the app off that prefix.
 */

use App\Http\Controllers\Shared\CalendarController;
use Illuminate\Support\Facades\Route;

Route::get('/calendar', [CalendarController::class, 'index'])->name('calendar');
Route::get('/calendar/feed', [CalendarController::class, 'feed'])->name('calendar.feed');
Route::post('/calendar/entries', [CalendarController::class, 'store'])->name('calendar.entries.store');
Route::put('/calendar/entries/{entry}', [CalendarController::class, 'update'])->name('calendar.entries.update');
Route::delete('/calendar/entries/{entry}', [CalendarController::class, 'destroy'])->name('calendar.entries.destroy');
Route::post('/calendar/entries/{entry}/complete', [CalendarController::class, 'complete'])->name('calendar.entries.complete');

// Receipts and bills: upload one, see it, put it on the calendar (CalendarDocumentController).
Route::post('/calendar/documents', [\App\Http\Controllers\Shared\CalendarDocumentController::class, 'store'])->name('calendar.documents.store');
Route::get('/calendar/documents/{document}', [\App\Http\Controllers\Shared\CalendarDocumentController::class, 'show'])->name('calendar.documents.show');
Route::post('/calendar/documents/{document}/add', [\App\Http\Controllers\Shared\CalendarDocumentController::class, 'add'])->name('calendar.documents.add');

// Move a delivery to another day from its calendar sheet (CalendarDeliveryController).
Route::post('/calendar/deliveries/{delivery}/schedule', [\App\Http\Controllers\Shared\CalendarDeliveryController::class, 'schedule'])->name('calendar.deliveries.schedule');
