<?php

declare(strict_types=1);

namespace App\Services\DataExchange;

use App\Models\Auth\User;
use App\Services\Shared\CsvTable;
use Closure;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * One downloadable (and, where it is safe, importable) table. The Settings → Import / Export page
 * lists every registered Dataset. Anything that is a ledger, a status or money is export only:
 * it never overrides importable(), so no import route can reach it.
 */
abstract class Dataset
{
    /** URL-safe, unique: items, suppliers, tariffs … */
    abstract public function key(): string;

    abstract public function label(): string;

    /** The section on the page: Items, Store, Inventory, Workforce, Finance, Procurement … */
    abstract public function group(): string;

    abstract public function description(): string;

    /** @return list<string> the first line of the exported file */
    abstract public function columns(): array;

    /** @return iterable<array<int, mixed>> one list of cells per row, in columns() order */
    abstract public function rows(): iterable;

    public function importable(): bool
    {
        return false;
    }

    /**
     * @return list<string> every column an imported file may have (the template's first line). Defaults to
     *                      the exported columns; a dataset that exports more than it accepts overrides it.
     */
    public function importColumns(): array
    {
        return $this->columns();
    }

    /** @return list<string> columns an imported file must have (the rest of importColumns() are optional) */
    public function required(): array
    {
        return $this->importColumns();
    }

    /** @return list<string> columns whose value must not repeat in an imported file */
    public function unique(): array
    {
        return [];
    }

    /** How many data rows one file may hold; a row may do a lot of work, so bigger sets are split. */
    public function maxRows(): int
    {
        return 5000;
    }

    /**
     * The on/off choices the import dialog offers for this dataset, name => label. They arrive in plan() as
     * $options[name] = true. Anything that destroys or goes live is off unless the person ticks it.
     *
     * @return array<string, string>
     */
    public function options(): array
    {
        return [];
    }

    /** One example row for the template file. @return array<int, mixed> */
    public function example(): array
    {
        return [];
    }

    /** Why this one is only exported, shown on the page. */
    public function exportOnlyReason(): string
    {
        return 'Export only';
    }

    /**
     * Works out what the file would do; adds problems to $table. Writes nothing.
     *
     * @param  array<string, bool>  $options  the ticked options()
     */
    public function plan(CsvTable $table, User $by, array $options = []): ImportPlan
    {
        throw new LogicException($this->key().' cannot be imported.');
    }

    /**
     * Queues one row: nothing to do when the record already holds every value.
     *
     * @param  array<string, mixed>  $values
     * @param  Closure(): mixed  $write
     */
    protected function queue(ImportPlan $plan, string $label, ?Model $existing, array $values, Closure $write): void
    {
        if ($existing === null) {
            $plan->add('create', $label, $write);

            return;
        }

        if ($this->differs($existing, $values)) {
            $plan->add('update', $label, $write, array_intersect_key($existing->getAttributes(), $values));

            return;
        }
        $plan->same();
    }

    /**
     * Whether the record holds different values (numbers compare as numbers, 5 and 5.00 are the same).
     *
     * @param  array<string, mixed>  $values
     */
    protected function differs(Model $existing, array $values): bool
    {
        foreach ($values as $column => $value) {
            $have = (string) ($existing->getAttribute($column) ?? '');
            $want = (string) ($value ?? '');
            if ($have !== $want && ! $this->sameNumber($have, $want)) {
                return true;
            }
        }

        return false;
    }

    /** 5 and 5.00 are the same number; 0101 and 101 (a code, a phone number) are not. */
    private function sameNumber(string $a, string $b): bool
    {
        $plain = '/^-?(0|[1-9]\d*)(\.\d+)?$/';

        return preg_match($plain, $a) === 1 && preg_match($plain, $b) === 1 && (float) $a === (float) $b;
    }
}
