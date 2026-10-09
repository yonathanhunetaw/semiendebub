<?php

use App\Http\Controllers\Admin\ItemDeployController;
use App\Http\Controllers\Admin\ItemController;
use App\Http\Controllers\Admin\SessionController;
use App\Http\Controllers\Admin\Store\StoreController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\Inventory\WarehouseController;
use App\Http\Controllers\Admin\Inventory\TransferController;
use App\Http\Controllers\Admin\Inventory\ReplenishController;
use App\Http\Controllers\Admin\Inventory\ReplenishmentController;
use App\Http\Controllers\Admin\Inventory\VariantCapacityController;
use App\Http\Controllers\Admin\Inventory\ShipmentController;
use App\Http\Controllers\Admin\Inventory\FleetController;
use App\Http\Controllers\Admin\CanvasController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("admin.{$baseDomain}")
    ->name('admin.')
    ->group(function () {

        // Guest routes
        Route::middleware(['guest.subdomain.login'])->group(function () {
            Route::middleware('notify.public.visit')->get('/', fn() => Inertia::render('Admin/Welcome/index'))->name('welcome');
            Route::get('/login', fn() => Inertia::render('Admin/Login/index'))->name('login');
        });

        // The replenishment approvals queue is also the store manager's: it is
        // where a manager rules on the transfers their store's capacity bands
        // propose (TransferPolicy decides which). Locked to their store by
        // ActiveStore like a store admin.
        Route::middleware(['auth', 'verified', 'role.subdomain:admin,store_manager', 'admin.store'])
            ->prefix('inventory')->name('inventory.')->group(function () {
                Route::get('/replenishment', [ReplenishmentController::class, 'index'])->name('replenishment.index');
                Route::post('/replenishment/{transfer}/approve', [ReplenishmentController::class, 'approve'])
                    ->name('replenishment.approve');
                Route::post('/replenishment/{transfer}/reject', [ReplenishmentController::class, 'reject'])
                    ->name('replenishment.reject');
            });

        // Authenticated Admin routes. `admin.store` settles the active store
        // (ActiveStore): store-zone screens follow it; `admin.global` routes
        // are the global zone, closed to store admins.
        Route::middleware(['auth', 'verified', 'role.subdomain:admin', 'admin.store'])->group(function () {

            Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
            // The top bar's quick search (orders, customers, items), JSON.
            Route::get('/search', \App\Http\Controllers\Admin\QuickSearchController::class)->name('search');
            // "How Duka works": the flow, the roles and the places, illustrated.
            // The guide (every way of working, step by step); /how-it-works was its first home.
            Route::get('/guide', fn (\Illuminate\Http\Request $request) => \Inertia\Inertia::render('Guide/Index', [
                'app' => 'admin',
                'chapter' => $request->query('chapter'),
                'step' => $request->query('step'),
            ]))->name('guide');
            Route::redirect('/how-it-works', '/guide')->name('flow');
            Route::get('/settings', fn() => Inertia::render('Admin/Settings/Index'))->name('settings');

            // ── Canvas ──
            Route::prefix('canvas')->name('canvas.')->group(function () {
                Route::get('/', [CanvasController::class, 'index'])->name('index');
                Route::post('/create', [CanvasController::class, 'create'])->name('create');
                Route::post('/share', [CanvasController::class, 'share'])->name('share');
                Route::post('/unshare', [CanvasController::class, 'unshare'])->name('unshare');
                Route::post('/save', [CanvasController::class, 'save'])->name('save');
                Route::get('/version/{id}', [CanvasController::class, 'getVersion'])->name('version');
                Route::post('/upload-asset', [CanvasController::class, 'uploadAsset'])->name('upload-asset');
            });

            // ── Global zone: the catalogue, stores, warehouses, fleet, sessions ──
            Route::middleware('admin.global')->group(function () {
            // ── Items ──
            Route::post('items/inline-options', [ItemController::class, 'storeInlineOption'])->name('items.inline-options');
            // ItemController::updateStatus() had no route at all, so the only
            // way an item's status could change was a full resource update.
            Route::patch('items/{item}/status', [ItemController::class, 'updateStatus'])->name('items.updateStatus');
            // Before the resource, or PATCH items/{item} would claim it.
            Route::patch('items/bulk-status', [ItemController::class, 'bulkUpdateStatus'])->name('items.bulkStatus');
            /*
             * `items/{item}/variants/{variant}/status` used to live here,
             * pointing at ItemController::updateVariantStatus(). That method was
             * deliberately removed when variant status became a per-store
             * concern — store_variants.active, managed by
             * Admin\Store\StoreController::updateVariant() — so the route was
             * left aimed at nothing and would have raised a 500 on any request
             * that reached it. Nothing in resources/js references it.
             */
            Route::delete('items/{item}/variants/{variant}', [ItemController::class, 'destroyVariant'])->name('items.variants.destroy');
            Route::post('items/{item}/deploy', [ItemDeployController::class, 'deploy'])->name('items.deploy');
            Route::resource('items', ItemController::class);

            // Users and sessions live under Settings, for global admins only.
            Route::resource('users', UserController::class);
            $sessionController = SessionController::class;
            require __DIR__ . '/../sessions.php';

            // ── Stores ──
            Route::resource('stores', StoreController::class);

            Route::prefix('inventory')->name('inventory.')->group(function () {
                Route::get('/stores', [StoreController::class, 'index'])->name('stores');

                // Warehouse CRUD
                Route::get('/warehouse', [WarehouseController::class, 'index'])->name('warehouse');
                Route::get('/warehouse/locations/create', [WarehouseController::class, 'create'])->name('locations.create');
                Route::post('/warehouse/locations', [WarehouseController::class, 'store'])->name('locations.store');
                Route::get('/warehouse/locations/{location}/edit', [WarehouseController::class, 'edit'])->name('locations.edit');
                Route::patch('/warehouse/locations/{location}', [WarehouseController::class, 'update'])->name('locations.update');
                Route::delete('/warehouse/locations/{location}', [WarehouseController::class, 'destroy'])->name('locations.destroy');

                // The one or two users who may oversee a warehouse. Admin-only;
                // see App\Policies\Inventory\WarehousePolicy.
                Route::post('/warehouse/{warehouse}/managers', [WarehouseController::class, 'assignManagers'])
                    ->name('warehouse.managers.assign');

                // Vehicles are shared by every store.
                Route::get('/fleet', [FleetController::class, 'index'])->name('fleet.index');
                Route::post('/fleet', [FleetController::class, 'store'])->name('fleet.store');
                Route::put('/fleet/{vehicle}', [FleetController::class, 'update'])->name('fleet.update');
                Route::delete('/fleet/{vehicle}', [FleetController::class, 'destroy'])->name('fleet.destroy');
            });
            });

            // ── Store zone: everything below follows the active store ──

            // ── Users, Sessions & Customers ──
            // The customers screen creates and edits in dialogs; there are no
            // create/show/edit pages, so those routes only ever 500'd.
            // Every order across every store, and each one's custody log.
            Route::get('/orders', [\App\Http\Controllers\Admin\OrderController::class, 'index'])->name('orders.index');
            Route::get('/orders/{reference}/custody', [\App\Http\Controllers\Admin\OrderController::class, 'custody'])->name('orders.custody');
            Route::get('/deliveries', [\App\Http\Controllers\Admin\DeliveryController::class, 'index'])->name('deliveries.index');
            Route::patch('/deliveries/{delivery}/courier', [\App\Http\Controllers\Admin\DeliveryController::class, 'assign'])->name('deliveries.assign');
            Route::get('/payments', [\App\Http\Controllers\Admin\PaymentController::class, 'index'])->name('payments.index');
            // The accounts customers pay into, per store, and who confirms each.
            Route::get('/payment-accounts', [\App\Http\Controllers\Admin\PaymentAccountController::class, 'index'])->name('payment-accounts.index');
            Route::post('/payment-accounts', [\App\Http\Controllers\Admin\PaymentAccountController::class, 'store'])->name('payment-accounts.store');
            Route::put('/payment-accounts/{paymentAccount}', [\App\Http\Controllers\Admin\PaymentAccountController::class, 'update'])->name('payment-accounts.update');
            Route::delete('/payment-accounts/{paymentAccount}', [\App\Http\Controllers\Admin\PaymentAccountController::class, 'destroy'])->name('payment-accounts.destroy');
            // What every seller holds, and their handovers to settlement accounts.
            Route::get('/balances', [\App\Http\Controllers\Admin\BalanceController::class, 'index'])->name('balances.index');
            // Customer credit: who owes what, who is overdue, and letting one off.
            Route::get('/credit', [\App\Http\Controllers\Admin\CreditController::class, 'index'])->name('credit.index');
            Route::patch('/credit/{customer}/override', [\App\Http\Controllers\Admin\CreditController::class, 'override'])->name('credit.override');

            // Customer-specific prices and discounts (set on a store's item
            // page under "Edit price & rule"), with when each discount ends.
            Route::get('/customers/discounts', [\App\Http\Controllers\Admin\CustomerController::class, 'discounts'])->name('customers.discounts');
            Route::resource('customers', \App\Http\Controllers\Admin\CustomerController::class)
                ->only(['index', 'store', 'update', 'destroy']);

            // ── Store inventory: locations, capacity, transfers, shipments ──
            Route::prefix('inventory')->name('inventory.')->group(function () {
                // ── Locations: the one tree, and each location's managers ──
                Route::get('/locations', [\App\Http\Controllers\Admin\Inventory\LocationController::class, 'index'])
                    ->name('stock-locations.index');
                Route::post('/locations/{stockLocation}/managers', [\App\Http\Controllers\Admin\Inventory\LocationController::class, 'assignManagers'])
                    ->name('stock-locations.managers');
                Route::post('/locations/{stockLocation}/staff', [\App\Http\Controllers\Admin\Inventory\LocationController::class, 'assignStaff'])
                    ->name('stock-locations.staff');

                // ── Variant capacity: min/max per variant, at every level ──
                Route::get('/capacity', [VariantCapacityController::class, 'index'])->name('capacity.index');
                Route::get('/capacity/{storeVariant}', [VariantCapacityController::class, 'edit'])->name('capacity.edit');
                Route::patch('/capacity/{storeVariant}', [VariantCapacityController::class, 'update'])->name('capacity.update');

                // Replenishment proposals (the approvals queue) are registered
                // above, in the group store managers may enter too.

                // Transfers
                Route::get('/transfers', [TransferController::class, 'index'])->name('transfers');
                Route::get('/transfers/create', [TransferController::class, 'create'])->name('transfers.create');
                Route::post('/transfers', [TransferController::class, 'store'])->name('transfers.store');
                Route::get('/transfers/{transfer}', [TransferController::class, 'show'])->name('transfers.show');
                Route::patch('/transfers/{transfer}/complete', [TransferController::class, 'complete'])->name('transfers.complete');
                Route::patch('/transfers/{transfer}/cancel', [TransferController::class, 'cancel'])->name('transfers.cancel');
                Route::patch('/transfers/{transfer}/dispatch', [TransferController::class, 'dispatchTransfer'])->name('transfers.dispatch');
                Route::patch('/transfers/{transfer}/courier', [TransferController::class, 'assignCourier'])->name('transfers.courier');

                // Shipments (shared cross-role domain)
                Route::get('/shipments', [ShipmentController::class, 'index'])->name('shipments.index');
                Route::post('/shipments', [ShipmentController::class, 'store'])->name('shipments.store');
                Route::get('/shipments/{shipment}', [ShipmentController::class, 'show'])->name('shipments.show');
                Route::post('/shipments/{shipment}/items', [ShipmentController::class, 'addItem'])->name('shipments.items.store');
                Route::delete('/shipments/{shipment}/items/{variant}', [ShipmentController::class, 'removeItem'])->name('shipments.items.destroy');
                Route::post('/shipments/{shipment}/agree', [ShipmentController::class, 'agree'])->name('shipments.agree');
                // The hand-off steps after scheduling: pick, prepare, check, sign.
                Route::post('/shipments/{shipment}/steps/{step}', [ShipmentController::class, 'step'])->name('shipments.step');
                Route::patch('/shipments/{shipment}/fleet', [ShipmentController::class, 'fleet'])->name('shipments.fleet');
                Route::post('/shipments/{shipment}/handover', [ShipmentController::class, 'handover'])->name('shipments.handover');
                Route::post('/shipments/{shipment}/receive', [ShipmentController::class, 'receive'])->name('shipments.receive');
                Route::patch('/shipments/{shipment}/status', [ShipmentController::class, 'transition'])->name('shipments.transition');

                // Replenishment Shipments (3-phase workflow)
                Route::get('/replenish', [ReplenishController::class, 'index'])->name('replenish');
                Route::post('/replenish', [ReplenishController::class, 'store'])->name('replenish.store');
                Route::get('/replenish/{transfer}', [ReplenishController::class, 'show'])->name('replenish.show');
                Route::get('/replenish/{transfer}/review', [ReplenishController::class, 'review'])->name('replenish.review');
                Route::post('/replenish/{transfer}/dispatch', [ReplenishController::class, 'dispatch'])->name('replenish.dispatch');
                Route::get('/replenish/{transfer}/dispatched', [ReplenishController::class, 'dispatched'])->name('replenish.dispatched');
            });

        });
    });
