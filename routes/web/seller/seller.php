<?php

use App\Http\Controllers\Seller\BalanceController;
use App\Http\Controllers\Seller\CartController;
use App\Http\Controllers\Seller\CategoryController;
use App\Http\Controllers\Seller\CustomerController;
use App\Http\Controllers\Seller\DashboardController;
use App\Http\Controllers\Seller\ItemController;
use App\Http\Controllers\Seller\LocationController;
use App\Http\Controllers\Seller\MenuController;
use App\Http\Controllers\Seller\OrderBoardController;
use App\Http\Controllers\Seller\OrderController;
use App\Http\Controllers\Seller\PaymentInboxController;
use App\Http\Controllers\Seller\RefillRequestController;
use App\Http\Controllers\Seller\SellerSettingsController;
use App\Http\Controllers\Seller\ShipmentController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("seller.$baseDomain")
    ->name('seller.')
    ->group(function () {

        Route::middleware(['guest.subdomain.login'])->group(function () {

            Route::middleware('notify.public.visit')->get('/', function () {
                return Inertia::render('Seller/Welcome/index');
            })->name('welcome');

            Route::get('/login', function () {
                return Inertia::render('Seller/Login/index');
            })->name('login'); // CRITICAL: Laravel's 'auth' middleware needs this name
        });

        // Store managers work in the seller app too: refill suggestions, refill
        // routes and the Remote Hub list are theirs (SHELF_REFILL_V2).
        Route::middleware(['auth', 'verified', 'role.subdomain:seller,store_manager'])->group(function () {
            Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
            // How Duka works, step by step (shared with the other apps).
            Route::get('/guide', fn (\Illuminate\Http\Request $request) => \Inertia\Inertia::render('Guide/Index', [
                'app' => 'seller',
                'chapter' => $request->query('chapter'),
                'step' => $request->query('step'),
            ]))->name('guide');
            Route::get('/menu', [MenuController::class, 'index'])->name('menu.index');
            /*
             * The seller order pipeline (to pay → paid → pick & pack → to
             * deliver → delivered), read from real sales by SellerOrderBoard.
             * An order's total is split into payment parts across the store's
             * collection accounts and cash; it leaves To pay once every part's
             * account owner has confirmed the money arrived (PaymentService).
             */
            Route::get('/orders', [OrderBoardController::class, 'index'])->name('orders.index');
            Route::get('/orders/confirmation', [OrderBoardController::class, 'confirmation'])->name('orders.confirmation');
            // Cart → order, the payment split, "customer says paid", and cancellation.
            Route::post('/orders', [OrderBoardController::class, 'store'])->name('orders.store');
            Route::put('/orders/{reference}/payments', [OrderBoardController::class, 'parts'])->name('orders.payments.update');
            Route::post('/orders/{reference}/payments/{payment}/claim', [OrderBoardController::class, 'claim'])
                ->whereNumber('payment')->name('orders.payments.claim');
            Route::post('/orders/{reference}/cancel', [OrderBoardController::class, 'cancel'])->name('orders.cancel');
            Route::patch('/orders/{reference}/address', [OrderBoardController::class, 'address'])->name('orders.address');
            Route::get('/orders/{reference}/pay', [OrderBoardController::class, 'pay'])->name('orders.pay');
            // The account owner's inbox: confirm a deposit, or "not received yet".
            Route::get('/payments/inbox', [PaymentInboxController::class, 'index'])->name('payments.inbox');
            Route::post('/payments/{payment}/confirm', [PaymentInboxController::class, 'confirm'])->name('payments.confirm');
            Route::post('/payments/{payment}/reject', [PaymentInboxController::class, 'reject'])->name('payments.reject');
            Route::post('/handovers/{remittance}/confirm', [PaymentInboxController::class, 'confirmHandover'])->name('handovers.confirm');
            Route::post('/handovers/{remittance}/reject', [PaymentInboxController::class, 'rejectHandover'])->name('handovers.reject');
            // The seller's balance: money held per account and cash, and handing it over.
            Route::get('/balance', [BalanceController::class, 'index'])->name('balance.index');
            Route::post('/balance/handovers', [BalanceController::class, 'remit'])->name('balance.remit');
            // Chain of custody: who held the order's goods, where, and when.
            Route::get('/orders/{reference}/custody', [OrderBoardController::class, 'custody'])->name('orders.custody');
            // Store Shelf, Store, Remote Hub and the main hubs, from stock_locations.
            Route::get('/locations/{location}', [LocationController::class, 'show'])->name('locations.show');
            // Shelf bins: assign an item (its band) or take it off, raise a
            // refill, and set where the store refills the item from.
            Route::get('/locations/{location}/assignable', [LocationController::class, 'assignable'])->name('locations.assignable');
            Route::patch('/locations/{location}/bands/{item}', [LocationController::class, 'updateBand'])->name('locations.bands.update');
            Route::delete('/locations/{location}/bands/{item}', [LocationController::class, 'destroyBand'])->name('locations.bands.destroy');
            Route::post('/locations/{location}/bands/{item}/refill', [LocationController::class, 'requestRefill'])->name('locations.bands.refill');
            Route::put('/locations/{location}/routes/{item}', [LocationController::class, 'updateRoute'])->name('locations.routes.update');
            // The refill list: the store manager takes suggestions onto the
            // Remote Hub list or a shipment manifest, adjusts or cancels them.
            Route::get('/refills', [RefillRequestController::class, 'index'])->name('refills.index');
            Route::get('/refills/permissions', [RefillRequestController::class, 'permissions'])->name('refills.permissions');
            Route::post('/refills/shipments', [RefillRequestController::class, 'ship'])->name('refills.ship');
            Route::post('/refills/{refillRequest}/remote', [RefillRequestController::class, 'addToRemoteList'])->name('refills.remote');
            Route::post('/shipments/{shipment}/refills', [RefillRequestController::class, 'addToManifest'])->name('refills.manifest');
            Route::patch('/refills/{refillRequest}', [RefillRequestController::class, 'update'])->name('refills.update');
            Route::post('/refills/{refillRequest}/cancel', [RefillRequestController::class, 'cancel'])->name('refills.cancel');
            Route::post('/refills/{refillRequest}/accept', [RefillRequestController::class, 'accept'])->name('refills.accept');
            /*
             * Pick & Pack is the real half of the pipeline: a paid order's lines
             * are sourced from an exact shelf, back room or warehouse before the
             * order can become a delivery.
             */
            // The old Pick & Pack queue is the board's Paid tab now: orders
            // waiting to be picked. Kept so existing links still land.
            Route::get('/orders/pick-pack', fn () => redirect()->to(route('seller.orders.index').'?tab=paid'))->name('orders.queue');
            Route::get('/orders/{reference}/pick-pack', [OrderController::class, 'pickPack'])->name('orders.pickpack');
            Route::post('/orders/{sale}/sourcing', [OrderController::class, 'confirmSourcing'])
                ->name('orders.sourcing.confirm');
            Route::get('/carts', [CartController::class, 'index'])->name('carts.index');
            Route::get('/items/search', [ItemController::class, 'search'])->name('items.search');
            Route::get('/items/page-json', [ItemController::class, 'pageItems'])->name('items.page-json');
            Route::get('/items', function () {
                return redirect()->route('seller.dashboard');
            })->name('items.index');
            Route::get('/items/{item}', [ItemController::class, 'show'])->name('items.show');
            Route::resource('customers', CustomerController::class)->only(['index', 'create', 'store', 'show', 'edit', 'update', 'destroy']);
            // Credit repayments: only an admin sets credit; a seller takes the money.
            Route::post('/customers/{customer}/repayments', [CustomerController::class, 'repay'])->name('customers.repay');
            Route::post('/customers/{customer}/repayments/{payment}/claim', [CustomerController::class, 'claimRepayment'])
                ->whereNumber('payment')->name('customers.repayments.claim');
            Route::post('/customers/{customer}/repayments/{payment}/void', [CustomerController::class, 'voidRepayment'])
                ->whereNumber('payment')->name('customers.repayments.void');
            Route::resource('categories', CategoryController::class)->only(['index', 'show']);
            Route::post('/carts/reorder', [CartController::class, 'reorder'])->name('carts.reorder');
            Route::resource('carts', CartController::class)->only(['create', 'store', 'show', 'edit', 'update', 'destroy']);
            Route::post('/carts/{cart}/items', [CartController::class, 'storeItem'])->name('carts.items.store');
            Route::delete('/carts/{cart}/items/{variant}', [CartController::class, 'destroyItem'])->name('carts.items.destroy');
            Route::get('/settings', [SellerSettingsController::class, 'index'])->name('settings.index');
            Route::patch('/settings', [SellerSettingsController::class, 'update'])->name('settings.update');
            // ── Shipments: 3-phase UI over the shared shipments domain ──
            Route::get('/shipments', [ShipmentController::class, 'index'])->name('shipments.index');
            Route::post('/shipments', [ShipmentController::class, 'store'])->name('shipments.store');
            Route::get('/shipments/{shipment}', [ShipmentController::class, 'show'])->name('shipments.show');
            Route::post('/shipments/{shipment}/manifest', [ShipmentController::class, 'saveManifest'])->name('shipments.manifest.save');
            Route::get('/shipments/{shipment}/review', [ShipmentController::class, 'review'])->name('shipments.review');
            Route::get('/shipments/{shipment}/dispatched', [ShipmentController::class, 'dispatched'])->name('shipments.dispatched');
            Route::post('/shipments/{shipment}/items', [ShipmentController::class, 'addItem'])->name('shipments.items.store');
            Route::post('/shipments/{shipment}/items/bulk', [ShipmentController::class, 'addItems'])->name('shipments.items.bulk');
            Route::delete('/shipments/{shipment}/items/{variant}', [ShipmentController::class, 'removeItem'])->name('shipments.items.destroy');
            Route::post('/shipments/{shipment}/items/{variant}/move', [ShipmentController::class, 'moveItem'])->name('shipments.items.move');
            Route::patch('/shipments/{shipment}/route', [ShipmentController::class, 'updateRoute'])->name('shipments.route.update');
            Route::post('/shipments/{shipment}/agree', [ShipmentController::class, 'agree'])->name('shipments.agree');
            // The hand-off steps after scheduling: pick, prepare, check, sign.
            Route::post('/shipments/{shipment}/steps/{step}', [ShipmentController::class, 'step'])->name('shipments.step');
            Route::patch('/shipments/{shipment}/status', [ShipmentController::class, 'transition'])->name('shipments.transition');
        });
    });
