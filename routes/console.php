<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
|--------------------------------------------------------------------------
| Automated replenishment
|--------------------------------------------------------------------------
|
| The observer on item_stocks proposes a transfer the moment a location falls
| through its floor. This nightly sweep is the backstop for bands breached
| while the observer was disabled, created after the stock had already fallen,
| or moved by a direct database edit.
|
| Proposals are raised unapproved either way — see
| App\Services\Inventory\ReplenishmentProposalService.
|
*/

Schedule::command('inventory:propose-replenishment')
    ->dailyAt('02:30')
    ->withoutOverlapping()
    ->onOneServer();

/*
|--------------------------------------------------------------------------
| Stock reservations
|--------------------------------------------------------------------------
|
| Checkout holds stock with an expiry; this returns expired holds to the
| sellable pool. See App\Services\StockService::reserve().
|
*/

Schedule::command('stock:release-stale-reservations')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->onOneServer();
