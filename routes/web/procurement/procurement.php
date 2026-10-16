<?php

use App\Http\Controllers\Procurement\DashboardController;
use App\Http\Controllers\Procurement\PayablesController;
use App\Http\Controllers\Procurement\PurchaseOrderController;
use App\Http\Controllers\Procurement\SupplierController;
use App\Http\Controllers\Procurement\SupplierPaymentController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("procurement.$baseDomain")
    ->name('procurement.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('Procurement/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Procurement/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        Route::middleware(['auth', 'verified', 'role.subdomain:procurement'])->group(function () {
            Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
            // The calendar: module dates + reminders and bills (shared with the other apps).
            require base_path('routes/web/partials/calendar.php');

            Route::resource('suppliers', SupplierController::class)->except(['show']);

            Route::get('/purchase-orders/variants', [PurchaseOrderController::class, 'variants'])->name('purchase_orders.variants');
            Route::resource('purchase-orders', PurchaseOrderController::class)
                ->except(['destroy'])
                ->names('purchase_orders')
                ->parameters(['purchase-orders' => 'purchase']);
            Route::controller(PurchaseOrderController::class)->prefix('purchase-orders/{purchase}')->name('purchase_orders.')->group(function () {
                Route::post('/submit', 'submit')->name('submit');
                Route::post('/approve', 'approve')->name('approve');
                Route::post('/send-back', 'sendBack')->name('send_back');
                Route::post('/ordered', 'markOrdered')->name('ordered');
                Route::post('/cancel', 'cancel')->name('cancel');
                Route::post('/close', 'close')->name('close');
            });
            Route::post('/purchase-orders/{purchase}/payments', [SupplierPaymentController::class, 'store'])->name('purchase_orders.payments.store');

            Route::get('/payables', [PayablesController::class, 'index'])->name('payables.index');
        });
    });
