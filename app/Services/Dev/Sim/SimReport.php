<?php

declare(strict_types=1);

namespace App\Services\Dev\Sim;

use Illuminate\Support\Facades\File;
use Throwable;

/**
 * What happened in a simulated run: how many of each step ran, every step a
 * service refused (the findings), the refusals the script meant to provoke
 * (a rule doing its job), and the reconciliation checks.
 * Written to storage/app/sim/report.md.
 */
final class SimReport
{
    public const PATH = 'app/sim/report.md';

    /** @var array<string, int> */
    public array $done = [];

    /** @var array<int, array{when: string, who: string, what: string, error: string}> */
    public array $refused = [];

    /** @var array<int, array{when: string, who: string, what: string, error: string}> */
    public array $expected = [];

    /** @var array<int, array{ok: bool, name: string, detail: string}> */
    public array $checks = [];

    /** @var array<int, string> */
    public array $notes = [];

    public function ok(string $kind): void
    {
        $this->done[$kind] = ($this->done[$kind] ?? 0) + 1;
    }

    public function refused(string $when, string $who, string $what, Throwable $e): void
    {
        $this->refused[] = ['when' => $when, 'who' => $who, 'what' => $what, 'error' => $this->describe($e)];
    }

    /** A refusal the script set out to cause: the rule worked. */
    public function expected(string $when, string $who, string $what, string $why): void
    {
        $this->expected[] = ['when' => $when, 'who' => $who, 'what' => $what, 'error' => $why];
    }

    public function check(bool $ok, string $name, string $detail = ''): void
    {
        $this->checks[] = ['ok' => $ok, 'name' => $name, 'detail' => $detail];
    }

    public function note(string $line): void
    {
        $this->notes[] = $line;
    }

    public function failedChecks(): int
    {
        return count(array_filter($this->checks, fn (array $check): bool => ! $check['ok']));
    }

    public function markdown(): string
    {
        $lines = ['# Simulated week: report', '', '_Written '.now()->toDateTimeString().' UTC._', ''];

        $lines[] = '## Checks';
        foreach ($this->checks as $check) {
            $lines[] = sprintf('- %s %s%s', $check['ok'] ? '✅' : '❌', $check['name'], $check['detail'] !== '' ? ': '.$check['detail'] : '');
        }

        $lines[] = '';
        $lines[] = '## Refused by the app ('.count($this->refused).')';
        $lines[] = 'Each is a step a real person tried and a service would not do: a bug, or a rule worth knowing.';
        $grouped = collect($this->refused)->groupBy(fn (array $row): string => $row['what'].' — '.$row['error']);
        foreach ($grouped as $row) {
            $first = $row->first();
            $lines[] = sprintf('- **%s** (%d×, first %s as %s): %s', $first['what'], $row->count(), $first['when'], $first['who'], $first['error']);
        }

        $lines[] = '';
        $lines[] = '## Refused on purpose ('.count($this->expected).')';
        foreach ($this->expected as $row) {
            $lines[] = sprintf('- %s, %s as %s: %s', $row['when'], $row['what'], $row['who'], $row['error']);
        }

        $lines[] = '';
        $lines[] = '## Steps done';
        ksort($this->done);
        foreach ($this->done as $kind => $count) {
            $lines[] = "- {$kind}: {$count}";
        }

        if ($this->notes !== []) {
            $lines[] = '';
            $lines[] = '## Notes';
            foreach ($this->notes as $note) {
                $lines[] = "- {$note}";
            }
        }

        return implode("\n", $lines)."\n";
    }

    public function write(): string
    {
        $path = storage_path(self::PATH);
        File::ensureDirectoryExists(dirname($path));
        File::put($path, $this->markdown());

        return $path;
    }

    private function describe(Throwable $e): string
    {
        $where = collect($e->getTrace())->first(fn (array $frame): bool => str_contains($frame['file'] ?? '', '/app/') && ! str_contains($frame['file'] ?? '', '/Dev/Sim/'));
        $at = $where === null ? '' : sprintf(' [%s:%d]', str_replace(base_path().'/', '', $where['file']), $where['line'] ?? 0);

        return class_basename($e).': '.trim($e->getMessage()).$at;
    }
}
