<?php

declare(strict_types=1);

namespace App\Console\Commands\Dev;

use App\Services\Dev\Sim\SimActions;
use App\Services\Dev\Sim\SimCast;
use App\Services\Dev\Sim\SimReport;
use App\Services\Dev\Sim\SimRunner;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

/**
 * Plays today's part of the simulated week on the real clock (make sim-live),
 * so the lists, the bell and the Guide world's Live mode move while you watch.
 * --speed=60 plays a shop hour a minute; --speed=1 is real time.
 *
 * Only on a *_sim database. Run sim:week first.
 */
final class SimulateLiveCommand extends Command
{
    /** @var string */
    protected $signature = 'sim:live {--speed=60 : Shop minutes per real minute}';

    /** @var string */
    protected $description = "Play today's simulated shop day live on the *_sim database";

    public function handle(SimCast $cast): int
    {
        if (($refusal = SimCast::refusal()) !== null) {
            $this->components->error($refusal);

            return self::FAILURE;
        }

        $path = storage_path(SimulateWeekCommand::TODAY);
        $events = is_file($path) ? json_decode((string) File::get($path), true) : null;

        if (! is_array($events) || $events === []) {
            $this->components->error('Nothing to play: run sim:week first (make sim).');

            return self::FAILURE;
        }

        // Played once: a second run would sell the same day again.
        File::put($path, '[]');

        $speed = max(0.1, (float) $this->option('speed'));
        $this->components->info(sprintf('Playing %d events of today at %sx (about %d minutes). Ctrl-C stops.', count($events), $speed, (int) ceil(
            (strtotime(end($events)['at']) - strtotime($events[0]['at'])) / 60 / $speed
        )));

        $report = new SimReport();
        (new SimRunner($cast->load(), app()->make(SimActions::class, ['cast' => $cast]), $report))
            ->run($events, live: true, speed: $speed, log: fn (string $line) => $this->line('  '.$line));

        $this->newLine();
        $this->line(sprintf('  Done. Refused by the app: %d; refused on purpose: %d.', count($report->refused), count($report->expected)));
        foreach (collect($report->refused)->unique(fn (array $r): string => $r['what'].$r['error']) as $row) {
            $this->line("  <error>✘</error> {$row['what']}: {$row['error']}");
        }

        return self::SUCCESS;
    }
}
