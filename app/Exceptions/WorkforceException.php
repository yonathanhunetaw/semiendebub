<?php

declare(strict_types=1);

namespace App\Exceptions;

use Exception;

/**
 * A site, key, shift or clock step that cannot happen: the key is not yours,
 * the site is not open, the QR has expired, or the user may not do it (403).
 */
class WorkforceException extends Exception
{
    public function __construct(string $message, int $code = 422, ?Exception $previous = null)
    {
        parent::__construct($message, $code, $previous);
    }
}
