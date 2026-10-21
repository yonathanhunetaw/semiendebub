<?php

declare(strict_types=1);

namespace App\Exceptions;

use Exception;

/**
 * A product idea step that cannot happen: the idea is not in the right status,
 * a needed detail is missing, or the user may not take this step.
 */
class ProductIdeaException extends Exception
{
    public function __construct(string $message, int $code = 422, ?Exception $previous = null)
    {
        parent::__construct($message, $code, $previous);
    }
}
