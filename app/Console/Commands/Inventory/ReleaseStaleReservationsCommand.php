<?php

declare(strict_types=1);

namespace App\Console\Commands\Inventory;

use App\Services\StockService;
use Illuminate\Console\Command;

/**
 * Frees stock held by reservations whose hold has run out (STOCK_PLAN.md §3.2).
 *
 * A checkout that is never paid for, or an order abandoned before Pick & Pack,
 * would otherwise keep its units unsellable for ever.
 */
class ReleaseStaleReservationsCommand extends Command
{
    protected $signature = 'stock:release-stale-reservations';

    protected $description = 'Release open stock reservations past their expiry';

    public function handle(StockService $stock): int
    {
        $released = $stock->releaseStaleReservations();

        $this->info("Released {$released} stale reservation(s).");

        return self::SUCCESS;
    }
}
