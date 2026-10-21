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

            // Product ideas: the stores' suggestions, and "have you considered this?" (shared with seller and admin).
            require base_path('routes/web/partials/ideas.php');
            // An approved idea is bought on an order line: it takes that line's item.
            Route::post('/ideas/{idea}/bought', [\App\Http\Controllers\Shared\ProductIdeaController::class, 'bought'])->whereNumber('idea')->name('ideas.bought');

            // Supplier quotes on an idea, and what each would cost on the shelf (SupplierQuoteService).
            Route::controller(\App\Http\Controllers\Shared\SupplierQuoteController::class)->group(function () {
                Route::get('/ideas/{idea}/quotes', 'show')->whereNumber('idea')->name('ideas.quotes');
                Route::post('/ideas/{idea}/quotes', 'store')->whereNumber('idea')->name('quotes.store');
                Route::put('/quotes/{quote}', 'update')->whereNumber('quote')->name('quotes.update');
                Route::post('/quotes/{quote}/recalculate', 'recalculate')->whereNumber('quote')->name('quotes.recalculate');
                Route::delete('/quotes/{quote}', 'destroy')->whereNumber('quote')->name('quotes.destroy');
            });

            // What estimates are made from: exchange rates, freight routes, the tariff table.
            Route::controller(\App\Http\Controllers\Procurement\CostSettingsController::class)->prefix('costs')->name('costs.')->group(function () {
                Route::get('/', 'index')->name('index');
                Route::post('/rates', 'setRate')->name('rates.store');
                Route::post('/routes', 'storeRoute')->name('routes.store');
                Route::put('/routes/{freightRoute}', 'updateRoute')->whereNumber('freightRoute')->name('routes.update');
            });
            // Consignments: goods we bought on their way in, stage by stage, and what each stage cost.
            Route::controller(\App\Http\Controllers\Procurement\ConsignmentController::class)->prefix('consignments')->name('consignments.')->group(function () {
                Route::get('/', 'index')->name('index');
                Route::post('/', 'store')->name('store');
                Route::get('/{consignment}', 'show')->whereNumber('consignment')->name('show');
                Route::put('/{consignment}', 'update')->whereNumber('consignment')->name('update');
                Route::post('/{consignment}/lines', 'addLine')->whereNumber('consignment')->name('lines.store');
                Route::delete('/lines/{line}', 'removeLine')->whereNumber('line')->name('lines.destroy');
                Route::post('/{consignment}/advance', 'advance')->whereNumber('consignment')->name('advance');
                Route::post('/{consignment}/cancel', 'cancel')->whereNumber('consignment')->name('cancel');
                Route::post('/{consignment}/finalise', 'finalise')->whereNumber('consignment')->name('finalise');
                Route::post('/{consignment}/costs', 'recordCost')->whereNumber('consignment')->name('costs.store');
                Route::delete('/costs/{cost}', 'deleteCost')->whereNumber('cost')->name('costs.destroy');
            });
            require base_path('routes/web/partials/import-costs.php');
            Route::post('/tariffs/import', [\App\Http\Controllers\Procurement\TariffController::class, 'import'])->name('tariffs.import');
            Route::resource('tariffs', \App\Http\Controllers\Procurement\TariffController::class)->only(['index', 'store', 'update', 'destroy']);
        });
    });
