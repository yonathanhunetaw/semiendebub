<?php

declare(strict_types=1);

namespace App\Console\Commands\Dev;

use App\Services\Dev\DomainMapGenerator;
use Illuminate\Console\Command;

/**
 * Scans routes, controllers, models, pages and dependencies, then writes
 * storage/app/dev-architecture-map.json for the /dev/architecture visualizer.
 */
final class GenerateDomainMapCommand extends Command
{
    /** @var string */
    protected $signature = 'dev:generate-domain-map
        {--output= : Absolute path to write the map to (defaults to storage/app/dev-architecture-map.json)}
        {--quiet-summary : Skip the per-domain summary table}';

    /** @var string */
    protected $description = 'Generate the domain module map consumed by /dev/architecture';

    public function handle(DomainMapGenerator $generator): int
    {
        $output = $this->option('output');
        $path = is_string($output) && $output !== '' ? $output : null;

        $this->components->task('Scanning routes, controllers, models & pages', function () use ($generator, $path, &$map, &$written): bool {
            $map = $generator->generate();
            $written = $generator->write($path);

            return true;
        });

        if (! is_array($map) || ! is_string($written)) {
            $this->components->error('Domain map generation failed.');

            return self::FAILURE;
        }

        $stats = $map['stats'];

        if (! $this->option('quiet-summary')) {
            $this->newLine();
            $this->table(
                ['Domain', 'Routes', 'Controllers', 'Models', 'Pages'],
                array_map(
                    static fn (array $domain): array => [
                        $domain['label'],
                        $domain['counts']['routes'],
                        $domain['counts']['controllers'],
                        $domain['counts']['models'],
                        $domain['counts']['pages'],
                    ],
                    array_values(array_filter(
                        $map['domains'],
                        static fn (array $domain): bool => array_sum($domain['counts']) > 0
                    ))
                )
            );
        }

        $this->components->info(sprintf(
            '%d routes, %d controllers, %d models, %d services, %d pages mapped in %dms.',
            $stats['routes'],
            $stats['controllers'],
            $stats['models'],
            $stats['services'],
            $stats['pages'],
            $map['meta']['duration_ms']
        ));

        if ($stats['orphan_pages'] > 0) {
            $this->components->warn(sprintf(
                '%d page component(s) are not rendered by any route.',
                $stats['orphan_pages']
            ));
        }

        $this->components->info('Map written to '.$written);

        return self::SUCCESS;
    }
}
