<?php

use App\Http\Controllers\Admin\Store\StoreController;
use Illuminate\Support\Facades\Route;

$baseDomain = config('app.system_domain', 'duka.local');

Route::domain("admin.{$baseDomain}")
    ->middleware(['auth', 'verified', 'role.subdomain:admin', 'admin.store'])
    ->group(function () {
        /*
         * Creating, renaming and deleting stores is the global zone. A store's
         * own pages (inventory, prices, replenishment, transfers) are open to
         * that store's admin too: `admin.store.record` 404s any other store.
         */

        // ── Stores CRUD ───────────────────────────────────────────────────────
        Route::prefix('stores')->name('store.')->middleware('admin.global')->group(function () {
            Route::get('/',             [StoreController::class, 'index'])->name('index');
            Route::get('/create',       [StoreController::class, 'create'])->name('create');
            Route::post('/',            [StoreController::class, 'store'])->name('store');
            Route::get('/{store}/edit', [StoreController::class, 'edit'])->name('edit');
            Route::patch('/{store}',    [StoreController::class, 'update'])->name('update');
            Route::delete('/{store}',   [StoreController::class, 'destroy'])->name('destroy');
        });

        Route::middleware('admin.store.record')->group(function () {
        Route::prefix('stores')->name('store.')->group(function () {

            // ── Inventory sub-pages (must come BEFORE /{store} wildcard) ──────
            Route::get('/{store}/inventory/replenish',  [StoreController::class, 'replenish'])->name('replenish');
            Route::get('/{store}/inventory/items/{item}', [StoreController::class, 'itemVariants'])->name('item.variants');
            Route::get('/{store}/inventory/deviations', [StoreController::class, 'deviations'])->name('deviations');

            Route::post('/{store}/transfers', [StoreController::class, 'storeTransfer'])->name('transfer.create');
            // ── Store show/edit/update/delete ─────────────────────────────────
            Route::get('/{store}',      [StoreController::class, 'show'])->name('show');
        });

        // ── Store variant & Price Management ──────────────────────────────────
        Route::patch('store-variants/{storeVariant}', [StoreController::class, 'updateVariant'])
            ->name('store-variant.update');

        // Customer-price upsert / delete
        Route::post('store-variants/{storeVariant}/customer-prices', [StoreController::class, 'upsertCustomerPrice'])
            ->name('store-variant.customer-price.upsert');

        Route::delete('store-variant-customer-prices/{price}', [StoreController::class, 'destroyCustomerPrice'])
            ->name('store-variant.customer-price.destroy');

        // Seller-price upsert / delete
        Route::post('store-variants/{storeVariant}/seller-prices', [StoreController::class, 'upsertSellerPrice'])
            ->name('store-variant.seller-price.upsert');

        Route::delete('store-variant-seller-prices/{price}', [StoreController::class, 'destroySellerPrice'])
            ->name('store-variant.seller-price.destroy');

        // Individual-price upsert / delete (one per variant, no user FK)
        Route::post('store-variants/{storeVariant}/individual-price', [StoreController::class, 'upsertIndividualPrice'])
            ->name('store-variant.individual-price.upsert');

        Route::delete('store-variant-individual-prices/{storeVariant}', [StoreController::class, 'destroyIndividualPrice'])
            ->name('store-variant.individual-price.destroy');

        // ── Replenishment / transfer actions ──────────────────────────────────
        Route::patch('store-transfers/{transfer}/cancel',   [StoreController::class, 'cancelTransfer'])->name('store-transfer.cancel');
        Route::patch('store-transfers/{transfer}/receive',  [StoreController::class, 'receiveTransfer'])->name('store-transfer.receive');
        Route::patch('store-transfers/{transfer}/dispatch', [StoreController::class, 'dispatchTransfer'])->name('store-transfer.dispatch');

        // ── Pricing override actions ──────────────────────────────────────────
        // {source} = b2b | individual | customer | seller
        Route::patch('store-price-overrides/{source}/{id}',  [StoreController::class, 'updateOverride'])->name('store-price-override.update');
        Route::delete('store-price-overrides/{source}/{id}', [StoreController::class, 'destroyOverride'])->name('store-price-override.destroy');
        });
    });
