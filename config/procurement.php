<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Approval limit
    |--------------------------------------------------------------------------
    |
    | A submitted purchase order always needs a second person to approve it.
    | Below this value (in ETB, at the order's exchange rate) another
    | procurement user may approve; at or above it only a global admin may.
    |
    */

    'admin_approval_etb' => (float) env('PROCUREMENT_ADMIN_APPROVAL_ETB', 500000),

    /*
    |--------------------------------------------------------------------------
    | Currencies
    |--------------------------------------------------------------------------
    |
    | What a supplier can invoice in. ETB is the home currency: its exchange
    | rate is always 1.
    |
    */

    'home_currency' => 'ETB',

    'currencies' => ['ETB', 'USD', 'CNY', 'EUR', 'AED', 'TRY', 'INR', 'GBP'],

    /*
    |--------------------------------------------------------------------------
    | Payment terms
    |--------------------------------------------------------------------------
    |
    | How a supplier is paid. Procurement P2 turns these into a schedule of
    | installments; until then they are recorded on the supplier (default)
    | and copied onto each order.
    |
    */

    'payment_terms' => [
        'immediate' => 'Immediate: one payment, due on order',
        'installments' => 'Installments: a deposit, then the rest in phases',
        'fixed_date' => 'Fixed date: one payment N days after order',
    ],

];
