<?php

declare(strict_types=1);

use App\Http\Controllers\Shared\ConsignmentCostInboxController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Import costs to confirm (shared by admin., finance. and procurement.)
|--------------------------------------------------------------------------
| Required from inside each app's authenticated group ({app}.import_costs.*).
| Who may confirm (finance or a global admin, never the recorder) is
| App\Services\Procurement\ConsignmentService's call.
*/

Route::controller(ConsignmentCostInboxController::class)->prefix('import-costs')->name('import_costs.')->group(function (): void {
    Route::get('/', 'index')->name('index');
    Route::post('/{cost}/confirm', 'confirm')->whereNumber('cost')->name('confirm');
    Route::post('/{cost}/reject', 'reject')->whereNumber('cost')->name('reject');
});
