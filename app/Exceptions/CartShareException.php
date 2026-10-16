<?php

declare(strict_types=1);

namespace App\Exceptions;

use Exception;

/**
 * A shared-cart step that cannot happen: the cart has no customer or no
 * lines, it is already an order, or the item is not sold in its store.
 */
class CartShareException extends Exception
{
    public function __construct(string $message, int $code = 422, ?Exception $previous = null)
    {
        parent::__construct($message, $code, $previous);
    }
}
