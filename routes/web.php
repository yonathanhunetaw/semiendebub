<?php

use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;

Route::get('/downloads', function () {
    $files = Storage::disk('public')->files('downloads');
    $fileData = array_map(function ($path) {
        return [
            'name' => basename($path),
            'url' => asset('storage/' . $path),
            'size' => round(Storage::disk('public')->size($path) / 1024 / 1024, 2) . ' MB'
        ];
    }, $files);

    return Inertia::render('Downloads', [
        'files' => $fileData
    ]);
});

/*-------------------------------------------------------------------------------------------------------------
| Auth - ('guest') & ('auth') - -> routes/auth.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/auth.php';                                // ['auth', 'verified']

/*-------------------------------------------------------------------------------------------------------------
| ADMIN - ['auth', 'verified'] - -> routes/web/admin/admin.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/admin/admin.php';                     // ['auth', 'verified', 'check_role:Admin']
require __DIR__.'/web/admin/cart.php';
require __DIR__.'/web/admin/inventory.php';

require __DIR__.'/web/admin/store.php';


/*-------------------------------------------------------------------------------------------------------------
| DELIVERY - ['auth', 'verified'] - -> routes/web/delivery/delivery.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/delivery/delivery.php';               // ['auth', 'verified', 'check_role:Delivery']

/*-------------------------------------------------------------------------------------------------------------
| DEV/LESSONS - ['auth', 'verified'] - -> routes/web/dev/lessons
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/dev/dev.php';
require __DIR__.'/web/dev/lessons/lesson4.php';
require __DIR__.'/web/dev/lessons/lesson6.php';

/*-------------------------------------------------------------------------------------------------------------
| ERRORS -> routes/web/errors/error.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/errors/error.php';

/*-------------------------------------------------------------------------------------------------------------
| FINANCE -> routes/web/finance/finance.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/finance/finance.php';                    // ['auth', 'verified', 'check_role:Finance']

/*-------------------------------------------------------------------------------------------------------------
| MARKETING -> routes/web/marketing/marketing.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/marketing/marketing.php';                 // ['auth', 'verified', 'check_role:Marketing']

/*-------------------------------------------------------------------------------------------------------------
| PROCUREMENT -> routes/web/procurement/procurement.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/procurement/procurement.php';             // ['auth', 'verified', 'check_role:Procurement']

/*--------------------------------------a
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/seller/seller.php';                        // ['auth', 'verified', 'check_role:Seller']

/*-------------------------------------------------------------------------------------------------------------
| SHARED -> routes/web/shared/shared.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/shared/shared.php';

/*-------------------------------------------------------------------------------------------------------------
| STOCK_KEEPER -> routes/web/stockkeeper/stockkeeper.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/stockkeeper/stockkeeper.php';              // ['auth', 'verified', 'check_role:StockKeeper']

/*-------------------------------------------------------------------------------------------------------------
| VENDOR -> routes/web/vendor/vendor.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/vendor/vendor.php';                        // ['auth', 'verified', 'check_role:Vendor']

/*-------------------------------------------------------------------------------------------------------------
| GUEST -> routes/web/guest/guest.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/guest/guest.php';
