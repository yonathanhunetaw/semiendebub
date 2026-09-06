<?php

namespace App\Exceptions;

use Exception;

class InsufficientStockException extends Exception
{
    protected ?int $storeVariantId;
    protected int $requestedQuantity;
    protected int $availableStock;

    public function __construct(
        string $message = "Insufficient stock for the requested item.",
        ?int $storeVariantId = null,
        int $requestedQuantity = 0,
        int $availableStock = 0,
        int $code = 422,
        ?Exception $previous = null
    ) {
        $this->storeVariantId = $storeVariantId;
        $this->requestedQuantity = $requestedQuantity;
        $this->availableStock = $availableStock;

        if ($storeVariantId && $message === "Insufficient stock for the requested item.") {
            $message = "Insufficient stock for StoreVariant #{$storeVariantId}: requested {$requestedQuantity}, available {$availableStock}.";
        }

        parent::__construct($message, $code, $previous);
    }

    public function getStoreVariantId(): ?int
    {
        return $this->storeVariantId;
    }

    public function getRequestedQuantity(): int
    {
        return $this->requestedQuantity;
    }

    public function getAvailableStock(): int
    {
        return $this->availableStock;
    }
}
