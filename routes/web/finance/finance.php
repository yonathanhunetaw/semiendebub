<?php

use App\Http\Controllers\Admin\SessionController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("finance.{$baseDomain}")
    ->name('finance.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            // Added a root route so typing the domain doesn't 404
            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('Finance/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Finance/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:finance'])->group(function () {
            Route::get('/dashboard', [\App\Http\Controllers\Finance\DashboardController::class, 'index'])->name('dashboard');

            // Sales and takings per business day, outside open hours, payment methods.
            Route::get('/reports', [\App\Http\Controllers\Finance\ReportController::class, 'index'])->name('reports.index');

            // Expenses: fuel for staff rides, rent, salaries (second person confirms).
            require base_path('routes/web/partials/expenses.php');

            // Supplier payments procurement recorded, waiting for a second person.
            Route::controller(\App\Http\Controllers\Shared\SupplierPaymentInboxController::class)
                ->prefix('supplier-payments')->name('supplier_payments.')->group(function () {
                    Route::get('/', 'index')->name('index');
                    Route::post('/{payment}/confirm', 'confirm')->name('confirm');
                    Route::post('/{payment}/reject', 'reject')->name('reject');
                });

            // What Duka owes vendors' stores, and payouts: one person records, another confirms.
            Route::prefix('vendor-payouts')->name('vendor_payouts.')->group(function () {
                Route::get('/', [\App\Http\Controllers\Finance\VendorPayoutController::class, 'index'])->name('index');
                Route::controller(\App\Http\Controllers\Admin\VendorMoneyController::class)->group(function () {
                    Route::post('/stores/{store}', 'record')->name('store');
                    Route::post('/{payout}/confirm', 'confirm')->name('confirm');
                    Route::post('/{payout}/reject', 'reject')->name('reject');
                });
            });

            // Import costs (freight, customs, port fees) waiting for their second person.
            require base_path('routes/web/partials/import-costs.php');

            // Lists and ends every user's session: global admins only.
            Route::prefix('sessions')->middleware('admin.global')->group(function () {
                Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
                Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
            });
        });
    });
