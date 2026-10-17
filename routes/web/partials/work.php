<?php

/*
 * Work: keys, sites (hours, closed days), and later opening/closing, shifts
 * and clock-in (docs/plans/sites-shifts.md). Required inside an app's
 * authenticated group (admin, seller, stock keeper, delivery), so names take
 * the app's prefix: `seller.work`, `delivery.work.keys.hand-over`…
 */

use App\Http\Controllers\Shared\Work\AttendanceController;
use App\Http\Controllers\Shared\Work\ClockController;
use App\Http\Controllers\Shared\Work\RotaController;
use App\Http\Controllers\Shared\Work\SiteController;
use App\Http\Controllers\Shared\Work\WorkController;
use Illuminate\Support\Facades\Route;

Route::get('/work', [WorkController::class, 'index'])->name('work');
Route::post('/work/keys/{key}/hand-over', [WorkController::class, 'handOver'])->name('work.keys.hand-over');
Route::post('/work/keys/{key}/force', [WorkController::class, 'force'])->name('work.keys.force');
Route::post('/work/key-handovers/{handover}/accept', [WorkController::class, 'accept'])->name('work.key-handovers.accept');
Route::post('/work/key-handovers/{handover}/reject', [WorkController::class, 'reject'])->name('work.key-handovers.reject');
Route::post('/work/key-handovers/{handover}/cancel', [WorkController::class, 'cancel'])->name('work.key-handovers.cancel');

Route::get('/work/sites', [SiteController::class, 'index'])->name('work.sites.index');
Route::get('/work/sites/{site}', [SiteController::class, 'show'])->name('work.sites.show');
Route::put('/work/sites/{site}/hours', [SiteController::class, 'saveHours'])->name('work.sites.hours');
Route::post('/work/sites/{site}/exceptions', [SiteController::class, 'storeException'])->name('work.sites.exceptions.store');
Route::delete('/work/sites/{site}/exceptions/{exception}', [SiteController::class, 'destroyException'])->name('work.sites.exceptions.destroy');
Route::put('/work/sites/{site}/plan', [SiteController::class, 'plan'])->name('work.sites.plan');
Route::put('/work/sites/{site}/settings', [SiteController::class, 'saveSettings'])->name('work.sites.settings');
Route::get('/work/sites/{site}/printed-qr', [SiteController::class, 'printedQr'])->name('work.sites.printed-qr');
Route::post('/work/sites/{site}/printed-qr', [SiteController::class, 'reprint'])->name('work.sites.reprint');

// At the counter: the QR lands here (through the root domain's /clock relay).
Route::get('/work/clock/{site}/{token}', [ClockController::class, 'show'])->name('work.clock');
Route::post('/work/sites/{site}/open', [ClockController::class, 'open'])->name('work.sites.open');
Route::post('/work/sites/{site}/close', [ClockController::class, 'close'])->name('work.sites.close');
Route::get('/work/sites/{site}/counter', [ClockController::class, 'counter'])->name('work.sites.counter');
Route::get('/work/sites/{site}/counter/code', [ClockController::class, 'code'])->name('work.sites.counter.code');

// The rota (managers) and the person's own accept / ask for a change.
Route::get('/work/sites/{site}/rota', [RotaController::class, 'show'])->name('work.rota');
Route::post('/work/sites/{site}/shifts', [RotaController::class, 'store'])->name('work.shifts.store');
Route::post('/work/sites/{site}/rota/publish', [RotaController::class, 'publish'])->name('work.rota.publish');
Route::post('/work/sites/{site}/rota/copy', [RotaController::class, 'copy'])->name('work.rota.copy');
Route::put('/work/sites/{site}/staffing-rules', [RotaController::class, 'saveRules'])->name('work.staffing-rules');
Route::put('/work/shifts/{shift}', [RotaController::class, 'update'])->name('work.shifts.update');
Route::post('/work/shifts/{shift}/cancel', [RotaController::class, 'cancel'])->name('work.shifts.cancel');
Route::post('/work/shifts/{shift}/accept', [RotaController::class, 'accept'])->name('work.shifts.accept');
Route::post('/work/shifts/{shift}/change', [RotaController::class, 'requestChange'])->name('work.shifts.change');

// Clock in and out at the counter; attendance for managers.
Route::post('/work/sites/{site}/clock-in', [ClockController::class, 'clockIn'])->name('work.clock-in');
Route::post('/work/sites/{site}/clock-out', [ClockController::class, 'clockOut'])->name('work.clock-out');
Route::get('/work/sites/{site}/attendance', [AttendanceController::class, 'show'])->name('work.attendance');
Route::post('/work/sites/{site}/attendance/clock-in', [AttendanceController::class, 'clockIn'])->name('work.attendance.clock-in');
Route::post('/work/time-entries/{entry}/clock-out', [AttendanceController::class, 'clockOut'])->name('work.time-entries.clock-out');
Route::put('/work/time-entries/{entry}', [AttendanceController::class, 'fix'])->name('work.time-entries.fix');
Route::post('/work/time-entries/{entry}/review', [AttendanceController::class, 'review'])->name('work.time-entries.review');
