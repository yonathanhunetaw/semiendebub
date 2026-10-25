<?php

declare(strict_types=1);

namespace App\Services\DataExchange;

use Closure;

/**
 * What an import would do, worked out before anything is written. A dry run shows it; a real run
 * calls commit() inside one transaction, so a file is applied whole or not at all.
 *
 * Besides the counts it keeps what a person should look at before pressing Apply (warnings), and
 * what a later reader needs to see what happened (the old values of every changed record and the ids
 * of every new one), which the controller saves as the import's audit file.
 */
final class ImportPlan
{
    public int $created = 0;

    public int $updated = 0;

    public int $unchanged = 0;

    /** @var list<string> a few example lines for the preview */
    public array $samples = [];

    /** @var list<string> things worth a second look that do not stop the import */
    public array $warnings = [];

    /** @var list<array{kind: string, label: string, before: ?array<string, mixed>, write: Closure(): mixed}> */
    private array $writes = [];

    /**
     * @param  Closure(): mixed  $write  may return the id of the record it created
     * @param  array<string, mixed>|null  $before  the values an update replaces, for the audit file
     */
    public function add(string $kind, string $label, Closure $write, ?array $before = null): void
    {
        match ($kind) {
            'create' => $this->created++,
            'update' => $this->updated++,
            default => $this->unchanged++,
        };

        if ($kind !== 'same') {
            $this->writes[] = ['kind' => $kind, 'label' => $label, 'before' => $before, 'write' => $write];
            if (count($this->samples) < 8) {
                $this->samples[] = ($kind === 'create' ? 'new: ' : 'change: ').$label;
            }
        }
    }

    /** A row that needs no write, counted as already up to date. */
    public function same(int $count = 1): void
    {
        $this->unchanged += $count;
    }

    public function warn(string $message): void
    {
        if (! in_array($message, $this->warnings, true) && count($this->warnings) < 40) {
            $this->warnings[] = $message;
        }
    }

    /** Runs every write. @return list<array{kind: string, label: string, before: ?array<string, mixed>, id: ?int}> */
    public function commit(): array
    {
        $log = [];
        foreach ($this->writes as $entry) {
            $result = ($entry['write'])();
            $log[] = ['kind' => $entry['kind'], 'label' => $entry['label'], 'before' => $entry['before'], 'id' => is_int($result) ? $result : null];
        }

        return $log;
    }

    public function empty(): bool
    {
        return $this->created + $this->updated + $this->unchanged === 0;
    }

    /** @return array{created: int, updated: int, unchanged: int, samples: list<string>, warnings: list<string>} */
    public function summary(): array
    {
        return [
            'created' => $this->created,
            'updated' => $this->updated,
            'unchanged' => $this->unchanged,
            'samples' => $this->samples,
            'warnings' => $this->warnings,
        ];
    }
}
