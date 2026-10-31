<?php

declare(strict_types=1);

namespace App\Console\Commands\Dev;

use App\Services\Dev\Sim\SimCast;
use App\Services\Dev\Sim\SimChecks;
use App\Services\Dev\Sim\SimReport;
use Illuminate\Console\Command;

/**
 * Re-runs the simulated week's checks (sim:week runs them too): sales per day,
 * the business share, every split, two people on every payment, days closed,
 * credit, stock, shipments. Reads only.
 */
final class SimCheckCommand extends Command
{
    /** @var string */
    protected $signature = 'sim:check {--days=7}';

    /** @var string */
    protected $description = 'Check the simulated week adds up (reads only)';

    public function handle(SimCast $cast): int
    {
        if (($refusal = SimCast::refusal()) !== null) {
            $this->components->error($refusal);

            return self::FAILURE;
        }

        $report = new SimReport();
        app(SimChecks::class, ['cast' => $cast->load()])->run($report, max(1, (int) $this->option('days')));

        foreach ($report->checks as $check) {
            $this->line(sprintf('  %s %s  <fg=gray>%s</>', $check['ok'] ? '<info>✔</info>' : '<error>✘</error>', $check['name'], $check['detail']));
        }

        return $report->failedChecks() === 0 ? self::SUCCESS : self::FAILURE;
    }
}
