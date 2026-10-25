<?php

declare(strict_types=1);

namespace App\Services\Shared;

use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The one place a CSV is written: UTF-8 with a BOM (Excel then reads Amharic names), no escape
 * character (PHP 8.4-safe), and a leading ' on any text a spreadsheet would run as a formula.
 */
class CsvWriter
{
    /**
     * @param  array<int, string>  $header
     * @param  iterable<array<int, mixed>>  $rows
     */
    public function write(array $header, iterable $rows): string
    {
        $out = fopen('php://temp', 'r+');
        $this->put($out, $header, $rows);

        rewind($out);
        $csv = (string) stream_get_contents($out);
        fclose($out);

        return $csv;
    }

    /**
     * Writes rows straight to a file as they are produced.
     *
     * @param  array<int, string>  $header
     * @param  iterable<array<int, mixed>>  $rows
     * @return int how many rows were written
     */
    public function toFile(string $path, array $header, iterable $rows): int
    {
        $out = fopen($path, 'w');
        $count = 0;
        $this->put($out, $header, (function () use ($rows, &$count) {
            foreach ($rows as $row) {
                $count++;

                yield $row;
            }
        })());
        fclose($out);

        return $count;
    }

    /**
     * Streams rows as they are produced, so a big table is never held in memory.
     *
     * @param  array<int, string>  $header
     * @param  iterable<array<int, mixed>>  $rows
     */
    public function download(string $filename, array $header, iterable $rows): StreamedResponse
    {
        return response()->streamDownload(function () use ($header, $rows): void {
            $out = fopen('php://output', 'w');
            $this->put($out, $header, $rows);
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * @param  resource  $out
     * @param  array<int, string>  $header
     * @param  iterable<array<int, mixed>>  $rows
     */
    private function put($out, array $header, iterable $rows): void
    {
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, $header, ',', '"', '');

        foreach ($rows as $row) {
            fputcsv($out, array_map($this->safe(...), array_values($row)), ',', '"', '');
        }
    }

    private function safe(mixed $cell): mixed
    {
        if ($cell === null) {
            return '';
        }
        if (is_bool($cell)) {
            return $cell ? '1' : '0';
        }

        return is_string($cell) && preg_match('/^[=+\-@\t\r]/', $cell) ? "'".$cell : $cell;
    }
}
