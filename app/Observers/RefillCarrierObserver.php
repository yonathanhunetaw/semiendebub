<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Fulfillment\Shipment;
use App\Models\Fulfillment\ShipmentItem;
use App\Models\StockKeeper\Transfer;
use App\Services\Inventory\RefillWorkflow;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Keeps refill legs in step with the transfer or shipment carrying them:
 * shelved or received = fulfilled; a cancelled shipment, a cancelled Remote Hub
 * transfer, or a line taken off a manifest hands its suggestions back to the
 * manager's list.
 *
 * Runs after commit, and never throws into the status change that triggered it.
 */
class RefillCarrierObserver
{
    public bool $afterCommit = true;

    public function __construct(private readonly RefillWorkflow $workflow)
    {
    }

    /** A manifest line was removed (or dropped to zero). */
    public function deleted(Model $line): void
    {
        if (! $line instanceof ShipmentItem) {
            return;
        }

        try {
            $this->workflow->manifestLineRemoved((int) $line->shipment_id, (int) $line->item_variant_id);
        } catch (Throwable $e) {
            Log::warning('Refill suggestions could not follow a removed manifest line', [
                'shipment_item_id' => $line->getKey(),
                'exception' => $e->getMessage(),
            ]);
        }
    }

    public function updated(Model $carrier): void
    {
        if (! $carrier->wasChanged('status')) {
            return;
        }

        try {
            match (true) {
                $carrier instanceof Transfer => $this->workflow->transferMoved($carrier),
                $carrier instanceof Shipment => $this->workflow->shipmentMoved($carrier),
                default => null,
            };
        } catch (Throwable $e) {
            Log::warning('Refill legs could not follow their carrier', [
                'carrier' => $carrier::class.'#'.$carrier->getKey(),
                'status' => $carrier->getAttribute('status'),
                'exception' => $e->getMessage(),
            ]);
        }
    }
}
