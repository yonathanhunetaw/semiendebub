<?php

declare(strict_types=1);

namespace App\Exceptions;

use Exception;

/**
 * A purchase order step that cannot happen: the order is not in the right
 * status, it has no lines, or the user may not take this step (the two-person
 * rule, the approval limit).
 */
class PurchaseOrderException extends Exception
{
    public function __construct(string $message, int $code = 422, ?Exception $previous = null)
    {
        parent::__construct($message, $code, $previous);
    }
}
