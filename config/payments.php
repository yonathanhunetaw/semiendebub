<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Providers
    |--------------------------------------------------------------------------
    |
    | The banks and wallets a payment account can be held at. The admin picks
    | one of these when adding an account; the seller app keys its avatar
    | chips off the same ids (resources/js/Data/sellerOrderFlow.ts).
    |
    */

    'providers' => [
        // Banks
        'cbe' => ['name' => 'Commercial Bank of Ethiopia (CBE)', 'type' => 'bank'],
        'awash' => ['name' => 'Awash Bank', 'type' => 'bank'],
        'boa' => ['name' => 'Bank of Abyssinia', 'type' => 'bank'],
        'dashen' => ['name' => 'Dashen Bank', 'type' => 'bank'],
        'coop' => ['name' => 'Coopbank of Oromia', 'type' => 'bank'],
        'abay' => ['name' => 'Abay Bank', 'type' => 'bank'],
        'amhara' => ['name' => 'Amhara Bank', 'type' => 'bank'],
        'berhan' => ['name' => 'Berhan Bank', 'type' => 'bank'],
        'bunna' => ['name' => 'Bunna Bank', 'type' => 'bank'],
        'enat' => ['name' => 'Enat Bank', 'type' => 'bank'],
        'hibret' => ['name' => 'Hibret Bank', 'type' => 'bank'],
        'hijra' => ['name' => 'Hijra Bank', 'type' => 'bank'],
        'lion' => ['name' => 'Lion International Bank', 'type' => 'bank'],
        'nib' => ['name' => 'Nib International Bank', 'type' => 'bank'],
        'oromia' => ['name' => 'Oromia Bank', 'type' => 'bank'],
        'siinqee' => ['name' => 'Siinqee Bank', 'type' => 'bank'],
        'tsehay' => ['name' => 'Tsehay Bank', 'type' => 'bank'],
        'wegagen' => ['name' => 'Wegagen Bank', 'type' => 'bank'],
        'zamzam' => ['name' => 'ZamZam Bank', 'type' => 'bank'],
        'zemen' => ['name' => 'Zemen Bank', 'type' => 'bank'],
        // Wallets
        'telebirr' => ['name' => 'Telebirr', 'type' => 'wallet'],
        'mpesa' => ['name' => 'M-Pesa Ethiopia', 'type' => 'wallet'],
        'cbebirr' => ['name' => 'CBE Birr', 'type' => 'wallet'],
        'amole' => ['name' => 'Amole (Dashen Bank)', 'type' => 'wallet'],
        'ebirr' => ['name' => 'E-Birr', 'type' => 'wallet'],
    ],

    /*
    |--------------------------------------------------------------------------
    | Cash held too long
    |--------------------------------------------------------------------------
    |
    | Cash a seller has held longer than this many days without handing it
    | over is flagged on their Balance page and in Admin → Balances. Cash has
    | no bank SMS to check it against, so the handover is the only check.
    |
    */

    'cash_flag_days' => (int) env('PAYMENTS_CASH_FLAG_DAYS', 3),

];
