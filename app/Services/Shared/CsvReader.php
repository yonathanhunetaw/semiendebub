<?php

declare(strict_types=1);

namespace App\Services\Shared;

/**
 * Reads CSV text (what the Settings page posts) into a CsvTable. Quoted values may hold commas and
 * newlines; the BOM Excel adds is dropped; columns are read by header name, in any order.
 */
class CsvReader
{
    public const MAX_ROWS = 20000;

    /**
     * @param  list<string>  $required  columns that must be in the header
     * @param  list<string>  $optional  columns that may be (anything else is reported)
     * @param  list<string>  $unique  columns whose value must not repeat in the file (ignored when empty)
     * @param  int  $maxRows  data rows allowed in one file
     */
    public function parse(string $csv, array $required, array $optional = [], array $unique = [], int $maxRows = self::MAX_ROWS): CsvTable
    {
        $handle = fopen('php://temp', 'r+');
        fwrite($handle, $csv);
        rewind($handle);

        $header = fgetcsv($handle, 0, ',', '"', '');
        if (! is_array($header) || $header === [null]) {
            fclose($handle);
            $table = new CsvTable([], []);
            $table->error('The file is empty: the first line must be the column names.');

            return $table;
        }
        $header[0] = ltrim((string) $header[0], "\xEF\xBB\xBF");
        $header = array_map(fn ($name): string => trim((string) $name), $header);

        $problems = [];
        foreach (array_diff($required, $header) as $missing) {
            $problems[] = "Missing column '{$missing}'. The first line must have: ".implode(', ', array_merge($required, $optional));
        }
        foreach (array_diff($header, $required, $optional) as $extra) {
            $problems[] = "Unknown column '{$extra}'. Allowed: ".implode(', ', array_merge($required, $optional));
        }
        if (count($header) !== count(array_unique($header))) {
            $problems[] = 'A column name appears twice in the first line.';
        }

        $rows = [];
        $errors = [];
        $line = 1;
        while ($problems === [] && ($cols = fgetcsv($handle, 0, ',', '"', '')) !== false) {
            $line++;
            if ($cols === [null] || $cols === []) {
                continue;
            }
            if (count($rows) >= $maxRows) {
                $errors[] = "More than {$maxRows} rows in one file: split it into several files.";
                break;
            }
            if (count($cols) !== count($header)) {
                $errors[] = "Line {$line}: ".count($cols).' values instead of '.count($header).' (a comma or quote inside a value?)';

                continue;
            }
            $rows[] = ['line' => $line, 'data' => array_combine($header, array_map($this->clean(...), $cols))];
        }
        fclose($handle);

        $table = new CsvTable($header, $rows);
        foreach ([...$problems, ...$errors] as $message) {
            $table->error($message);
        }

        foreach ($unique as $column) {
            $seen = [];
            foreach ($rows as $row) {
                $value = mb_strtolower($row['data'][$column] ?? '');
                if ($value === '') {
                    continue;
                }
                isset($seen[$value])
                    ? $table->error("{$column} '{$row['data'][$column]}' is already on line {$seen[$value]}", $row['line'])
                    : $seen[$value] = $row['line'];
            }
        }

        return $table;
    }

    /** Takes back what CsvWriter did: the ' put before text a spreadsheet would run as a formula. */
    private function clean(mixed $cell): string
    {
        return trim((string) preg_replace('/^\'(?=[=+\-@\t\r])/', '', (string) $cell));
    }
}
