<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Storefront Store
    |--------------------------------------------------------------------------
    |
    | The public storefront reads its catalogue from a single store. Set this
    | explicitly in .env once the retail store exists; when it is null the
    | catalogue service falls back to the first active store.
    |
    */

    'store_id' => env('STOREFRONT_STORE_ID') !== null
        ? (int) env('STOREFRONT_STORE_ID')
        : null,

    /*
    |--------------------------------------------------------------------------
    | Catalogue
    |--------------------------------------------------------------------------
    */

    'per_page' => (int) env('STOREFRONT_PER_PAGE', 24),

    /*
    |--------------------------------------------------------------------------
    | Stock Thresholds
    |--------------------------------------------------------------------------
    |
    | Availability badges on the buyer-facing cards: at or below this figure a
    | variant is flagged "Low Stock", at zero it becomes "Out of Stock".
    |
    */

    'low_stock_threshold' => (int) env('STOREFRONT_LOW_STOCK_THRESHOLD', 10),

    /*
    |--------------------------------------------------------------------------
    | Cart
    |--------------------------------------------------------------------------
    |
    | Buyer carts are created with this status so that CartService::mergeGuestCart
    | picks them up verbatim when a guest signs in. Do not change without
    | updating that method.
    |
    */

    'cart_status' => 'pending',

    'max_line_quantity' => (int) env('STOREFRONT_MAX_LINE_QUANTITY', 999),

];
