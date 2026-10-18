<?php

/*
 * Expenses (ExpenseController), required inside the finance app's group and
 * the admin app's global zone, so names take the app's prefix:
 * `finance.expenses.index`, `admin.expenses.confirm`…
 */

use App\Http\Controllers\Shared\ExpenseController;
use Illuminate\Support\Facades\Route;

Route::controller(ExpenseController::class)->prefix('expenses')->name('expenses.')->group(function () {
    Route::get('/', 'index')->name('index');
    Route::post('/', 'store')->name('store');
    Route::post('/{expense}/confirm', 'confirm')->name('confirm');
    Route::post('/{expense}/reject', 'reject')->name('reject');
    Route::get('/{expense}/receipt', 'receipt')->name('receipt');
});
