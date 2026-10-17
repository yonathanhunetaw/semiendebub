<?php

declare(strict_types=1);

namespace App\Console\Commands\Workforce;

use App\Services\Workforce\AttendanceService;
use App\Services\Workforce\SiteDayService;
use Illuminate\Console\Command;

/**
 * Every few minutes (routes/console.php): openings not done by the opening
 * time plus the site's grace become "missed", which puts them in the
 * managers' bell (a missed site can still be opened); clock-ins nobody
 * closed are closed and flagged for the manager.
 */
class SweepSitesCommand extends Command
{
    protected $signature = 'sites:sweep';

    protected $description = 'Mark late site openings missed and close forgotten clock-ins';

    public function handle(SiteDayService $days, AttendanceService $attendance): int
    {
        $missed = $days->sweep();
        $closed = $attendance->autoClose();

        $this->info("Openings marked missed: {$missed}. Clock-ins closed: {$closed}.");

        return self::SUCCESS;
    }
}
