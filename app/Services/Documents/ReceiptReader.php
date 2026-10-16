<?php

declare(strict_types=1);

namespace App\Services\Documents;

/** Reads an uploaded receipt or bill. Bound to ClaudeReceiptReader (AppServiceProvider). */
interface ReceiptReader
{
    /** Is a reader set up? When not, the person fills the bill in by hand. */
    public function enabled(): bool;

    /**
     * @param  string  $contents  the file's bytes
     *
     * @throws ReceiptReaderException when the document could not be read
     */
    public function read(string $contents, string $mimeType, string $today): ReceiptReading;
}
