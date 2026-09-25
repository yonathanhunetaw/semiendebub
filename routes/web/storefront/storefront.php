<?php

declare(strict_types=1);

use App\Http\Controllers\Storefront\CartController;
use App\Http\Controllers\Storefront\StorefrontController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Public Storefront
|--------------------------------------------------------------------------
|
| Deliberately unauthenticated. Shoppers browse and fill a cart as guests;
| the cart is keyed to their session id and adopted by their account at
| sign-in via CartService::mergeGuestCart(). Only checkout is gated.
|
*/

Route::get('/shop', [StorefrontController::class, 'index'])
    ->name('storefront.index');

// Product detail: where the shopper picks a variant before adding to cart.
Route::get('/shop/items/{item}', [StorefrontController::class, 'show'])
    ->name('storefront.items.show');

Route::prefix('shop/cart')->name('storefront.cart.')->group(function (): void {
    Route::post('/items', [CartController::class, 'store'])->name('items.store');
    Route::patch('/items/{variant}', [CartController::class, 'update'])->name('items.update');
    Route::delete('/items/{variant}', [CartController::class, 'destroy'])->name('items.destroy');
});

Route::post('/shop/checkout', [CartController::class, 'checkout'])
    ->name('storefront.checkout');
