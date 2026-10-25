<?php

declare(strict_types=1);

namespace App\Services\Shared;

/**
 * A parsed CSV: rows keyed by header name, each remembering its line in the file, and every
 * problem found so far as a line-numbered message. Nothing is written until errors() is empty.
 */
final class CsvTable
{
    /** @var list<string> */
    private array $errors = [];

    /**
     * @param  list<string>  $header
     * @param  list<array{line: int, data: array<string, string>}>  $rows
     */
    public function __construct(public readonly array $header, public readonly array $rows)
    {
    }

    public function error(string $message, ?int $line = null): void
    {
        $this->errors[] = $line === null ? $message : "Line {$line}: {$message}";
    }

    /** @return list<string> */
    public function errors(): array
    {
        return $this->errors;
    }

    public function ok(): bool
    {
        return $this->errors === [];
    }

    /** A yes/no column (1, 0, yes, no, true, false); empty gives null. */
    public function bool(array $row, string $column): ?bool
    {
        $value = mb_strtolower($row['data'][$column] ?? '');
        if ($value === '') {
            return null;
        }
        if (in_array($value, ['1', 'yes', 'y', 'true'], true)) {
            return true;
        }
        if (in_array($value, ['0', 'no', 'n', 'false'], true)) {
            return false;
        }
        $this->error("{$column} '{$value}' must be yes or no", $row['line']);

        return null;
    }

    /** A whole number in a column; empty gives null. Reports a bad value against its line. */
    public function int(array $row, string $column, bool $required = false): ?int
    {
        $value = $row['data'][$column] ?? '';
        if ($value === '') {
            $required && $this->error("{$column} is empty", $row['line']);

            return null;
        }
        if (! preg_match('/^-?\d+$/', $value)) {
            $this->error("{$column} '{$value}' is not a whole number", $row['line']);

            return null;
        }

        return (int) $value;
    }

    /** A decimal in a column (a dot or comma as separator); empty gives null. */
    public function decimal(array $row, string $column, bool $required = false): ?float
    {
        $value = str_replace(',', '.', $row['data'][$column] ?? '');
        if ($value === '') {
            $required && $this->error("{$column} is empty", $row['line']);

            return null;
        }
        if (! is_numeric($value)) {
            $this->error("{$column} '{$value}' is not a number", $row['line']);

            return null;
        }

        return (float) $value;
    }

    /** A Y-m-d date in a column; empty gives null. */
    public function date(array $row, string $column, bool $required = false): ?string
    {
        $value = $row['data'][$column] ?? '';
        if ($value === '') {
            $required && $this->error("{$column} is empty", $row['line']);

            return null;
        }
        $parsed = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if ($parsed === false || $parsed->format('Y-m-d') !== $value) {
            $this->error("{$column} '{$value}' must be a date like 2026-10-25", $row['line']);

            return null;
        }

        return $value;
    }

    /**
     * A name looked up case-insensitively in a map of name => id; unknown names list what is known.
     *
     * @param  array<string, int>  $map  lower-case name => id
     * @param  list<string>  $known  names to show in the hint
     */
    public function lookup(array $row, string $column, array $map, array $known, bool $required = false): ?int
    {
        $value = $row['data'][$column] ?? '';
        if ($value === '') {
            $required && $this->error("{$column} is empty", $row['line']);

            return null;
        }
        $id = $map[mb_strtolower($value)] ?? null;
        if ($id === null) {
            $this->error("unknown {$column} '{$value}' (known: ".implode(', ', array_slice($known, 0, 12)).(count($known) > 12 ? ', …' : '').')', $row['line']);
        }

        return $id;
    }
}
