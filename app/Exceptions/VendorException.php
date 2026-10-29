<?php

declare(strict_types=1);

namespace App\Exceptions;

use Exception;

/** A vendor onboarding step that cannot happen: already reviewed, a taken email, or not a global admin. */
class VendorException extends Exception
{
    public function __construct(string $message, int $code = 422, ?Exception $previous = null)
    {
        parent::__construct($message, $code, $previous);
    }
}
