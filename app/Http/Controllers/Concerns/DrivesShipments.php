<?php

declare(strict_types=1);

namespace App\Http\Controllers\Concerns;

use App\Http\Requests\Shipment\TransitionShipmentRequest;
use App\Models\Fulfillment\Shipment;
use App\Services\ShipmentWorkflowService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;

/**
 * Shared shipment driving for the four role controllers.
 *
 * Every role posts to its own route but lands here, so the lifecycle is
 * defined once. Two gates apply on each move:
 *
 *   1. the role must own that transition (ShipmentWorkflowService::ROLE_TRANSITIONS)
 *   2. the shipment must currently be able to make it (the state machine)
 */
trait DrivesShipments
{
    /**
     * The role this controller acts as, e.g. 'stock_keeper'.
     */
    abstract protected function shipmentRole(): string;

    /**
     * Stores this user may act on, or null for unrestricted (admin).
     *
     * @return array<int, int>|null
     */
    abstract protected function shipmentStoreScope(): ?array;

    protected function driveShipment(
        TransitionShipmentRequest $request,
        Shipment $shipment,
        ShipmentWorkflowService $workflow,
    ): RedirectResponse {
        if (! $this->shipmentIsInScope($shipment)) {
            abort(403, 'That shipment does not involve your store.');
        }

        $target = (string) $request->validated('status');

        if (! in_array($target, $workflow->allowedFor($shipment, $this->shipmentRole()), true)) {
            return back()->with(
                'error',
                "Your role cannot move this shipment to {$target} from {$shipment->status}."
            );
        }

        try {
            $workflow->transition($shipment, $target, $request->extraAttributes());
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Shipment {$shipment->reference} is now {$target}.");
    }

    /**
     * A shipment is in scope when the acting user's store is either end of it.
     */
    protected function shipmentIsInScope(Shipment $shipment): bool
    {
        $scope = $this->shipmentStoreScope();

        if ($scope === null) {
            return true;
        }

        return in_array((int) $shipment->origin_store_id, $scope, true)
            || in_array((int) $shipment->destination_store_id, $scope, true);
    }

    /**
     * The acting user's store, as a scope array.
     *
     * @return array<int, int>|null
     */
    protected function ownStoreScope(): ?array
    {
        $storeId = Auth::user()?->store_id;

        // A user with no store sees nothing rather than everything.
        return $storeId ? [(int) $storeId] : [];
    }
}
