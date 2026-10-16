<?php

declare(strict_types=1);

namespace App\Services\Documents;

use RuntimeException;

/** The reader could not make sense of a document; the message is safe to show. */
class ReceiptReaderException extends RuntimeException
{
}
