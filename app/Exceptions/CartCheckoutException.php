<?php

namespace App\Exceptions;

use Exception;

class CartCheckoutException extends Exception
{
    protected ?int $cartId;

    public function __construct(
        string $message = "Cart checkout failed.",
        ?int $cartId = null,
        int $code = 422,
        ?Exception $previous = null
    ) {
        $this->cartId = $cartId;
        parent::__construct($message, $code, $previous);
    }

    public function getCartId(): ?int
    {
        return $this->cartId;
    }
}
