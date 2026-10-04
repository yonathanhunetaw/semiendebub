<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Automated replenishment
    |--------------------------------------------------------------------------
    |
    | The planner watches variant capacity bands (store_variant_capacities) and
    | proposes a Transfer when a location falls to its minimum. Proposals are
    | always raised unapproved; see ReplenishmentProposalService.
    |
    | `observe_stock_changes` drives the reactive half — an observer on
    | item_stocks, so a sale or a received transfer is noticed immediately.
    | Turning it off leaves the nightly sweep (`inventory:propose-replenishment`)
    | as the only trigger, which is the right setting for bulk imports.
    |
    */

    'auto_replenishment' => [
        'enabled' => (bool) env('INVENTORY_AUTO_REPLENISHMENT', true),
        'observe_stock_changes' => (bool) env('INVENTORY_REPLENISH_ON_STOCK_CHANGE', true),
    ],

    /*
    |--------------------------------------------------------------------------
    | Fulfilment promises
    |--------------------------------------------------------------------------
    |
    | What a shopper is told when a cart line can only be sourced from a main
    | warehouse. Checkout requires their explicit agreement to this wait before
    | taking payment, so the wording is configuration, not a string in a view.
    |
    */

    'delayed_promise' => env('INVENTORY_DELAYED_PROMISE', 'Available tomorrow'),

    /*
    |--------------------------------------------------------------------------
    | Shelf refills
    |--------------------------------------------------------------------------
    |
    | A Store Shelf bin at its refill line raises a refill as soon as its stock
    | changes (App\Observers\ShelfRefillObserver). Turn it off for bulk imports;
    | stock keepers can still raise refills by hand.
    |
    */

    'shelf_refill' => [
        'observe_stock_changes' => (bool) env('INVENTORY_SHELF_REFILL_ON_STOCK_CHANGE', true),
    ],

    'same_day_promise' => env('INVENTORY_SAME_DAY_PROMISE', 'Available today'),

    /*
    |--------------------------------------------------------------------------
    | Reservations
    |--------------------------------------------------------------------------
    |
    | Checkout reserves stock at the store. A paid order holds it until Pick &
    | Pack; an unpaid one only this long, after which
    | `stock:release-stale-reservations` gives it back to the sellable pool.
    |
    */

    'unpaid_reservation_minutes' => (int) env('INVENTORY_UNPAID_RESERVATION_MINUTES', 120),

];
