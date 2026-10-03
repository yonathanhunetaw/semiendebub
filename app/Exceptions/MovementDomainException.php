<?php

declare(strict_types=1);

namespace App\Exceptions;

use Exception;

/**
 * A stock movement was raised in the wrong domain.
 *
 * Three movement types exist and they are not interchangeable:
 *
 *   Shipment  bulk freight between structural nodes — warehouse to warehouse,
 *             warehouse to remote warehouse.
 *   Transfer  localized balancing — remote warehouse to a store back room,
 *             back room to shop floor, store to store.
 *   Delivery  fulfilment of an external customer order, leaving the specific
 *             location chosen during Pick & Pack.
 *
 * Raised when a caller tries to express one as another, e.g. a Transfer
 * between two main warehouses (that is a Shipment) or a Shipment into a shop
 * floor (that is a Transfer).
 *
 * @see \App\Services\Fulfillment\MovementDomainService
 */
class MovementDomainException extends Exception
{
    public function __construct(
        string $message,
        public readonly ?string $attemptedDomain = null,
        public readonly ?string $correctDomain = null,
        int $code = 422,
        ?Exception $previous = null,
    ) {
        parent::__construct($message, $code, $previous);
    }

    /** @param  array<string, mixed>  $from */
    public static function wrongDomain(string $attempted, string $correct, array $from, array $to): self
    {
        return new self(
            sprintf(
                '%s → %s is a %s, not a %s.',
                $from['label'] ?? 'origin',
                $to['label'] ?? 'destination',
                ucfirst($correct),
                ucfirst($attempted),
            ),
            $attempted,
            $correct,
        );
    }
}
