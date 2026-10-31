<?php

declare(strict_types=1);

namespace App\Console\Commands\Dev;

use App\Services\Dev\Sim\SimActions;
use App\Services\Dev\Sim\SimCast;
use App\Services\Dev\Sim\SimChecks;
use App\Services\Dev\Sim\SimDayScript;
use App\Services\Dev\Sim\SimReport;
use App\Services\Dev\Sim\SimRunner;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\Sites;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

/**
 * A week of the shop, already lived (make sim): about 100,000 birr of sales a
 * day, the morning shipment, keys, opening and closing, drivers, payments
 * confirmed by a second person, credit, and the things that go wrong. Every
 * step goes through the app's own services with the clock set back to its
 * moment. Today's part is saved for sim:live to play.
 *
 * Only on a *_sim database (the copy make sim makes), never dev or prod.
 */
final class SimulateWeekCommand extends Command
{
    /** @var string */
    protected $signature = 'sim:week {--days=7 : Days ending today} {--seed=1 : The same seed gives the same week} {--today : Also play today now, back-dated, instead of leaving it for sim:live}';

    /** @var string */
    protected $description = 'Simulate a shop week on the *_sim database (people, sales, shipments, keys, cash) and report what the app refused';

    public const TODAY = 'app/sim/today.json';

    public function handle(SimCast $cast, Sites $sites): int
    {
        if (($refusal = SimCast::refusal()) !== null) {
            $this->components->error($refusal);

            return self::FAILURE;
        }

        $days = max(1, (int) $this->option('days'));
        $this->components->task('The people, accounts, customers and goods', fn () => $cast->build());

        $events = (new SimDayScript($cast, $sites, (int) $this->option('seed')))->week($days);
        $today = LocalTime::startOf(LocalTime::today())->utc()->format('Y-m-d\TH:i:s\Z');
        $past = $this->option('today') ? $events : array_values(array_filter($events, fn (array $e): bool => $e['at'] < $today));
        $live = $this->option('today') ? [] : array_values(array_filter($events, fn (array $e): bool => $e['at'] >= $today));

        $report = new SimReport();
        $runner = new SimRunner($cast, app()->make(SimActions::class, ['cast' => $cast]), $report);

        $this->components->info(sprintf('Playing %d events over %d days (today: %d events saved for sim:live)', count($past), $days, count($live)));
        $bar = $this->output->createProgressBar(count($past));
        $chunk = [];
        foreach ($past as $event) {
            $chunk[] = $event;
            if (count($chunk) === 50) {
                $runner->run($chunk);
                $bar->advance(count($chunk));
                $chunk = [];
            }
        }
        $runner->run($chunk);
        $bar->finish();
        $this->newLine(2);

        File::ensureDirectoryExists(dirname(storage_path(self::TODAY)));
        File::put(storage_path(self::TODAY), json_encode($live, JSON_PRETTY_PRINT));

        app(SimChecks::class, ['cast' => $cast])->run($report, $days);
        $path = $report->write();

        $this->table(['Person', 'App', 'Email'], $cast->roster());
        $this->line('  Password for everyone: <info>'.SimCast::PASSWORD.'</info>');
        $this->newLine();
        foreach ($report->checks as $check) {
            $this->line(sprintf('  %s %s  <fg=gray>%s</>', $check['ok'] ? '<info>✔</info>' : '<error>✘</error>', $check['name'], $check['detail']));
        }
        $this->newLine();
        $this->line(sprintf('  Refused by the app: <comment>%d</comment> steps (%d kinds); refused on purpose: %d', count($report->refused), collect($report->refused)->unique(fn (array $r): string => $r['what'].$r['error'])->count(), count($report->expected)));
        $this->line("  Report: {$path}");

        return self::SUCCESS;
    }
}
