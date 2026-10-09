<?php

declare(strict_types=1);

namespace App\Exceptions;

use Exception;

/**
 * A payment step that cannot happen: the parts do not add up, the order is
 * not waiting for money, or the user is not the one who may confirm it.
 */
class PaymentException extends Exception
{
    public function __construct(string $message, int $code = 422, ?Exception $previous = null)
    {
        parent::__construct($message, $code, $previous);
    }
}
