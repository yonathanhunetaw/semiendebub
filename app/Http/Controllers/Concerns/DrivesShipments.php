<?php

declare(strict_types=1);

namespace App\Http\Controllers\Concerns;

use App\Http\Requests\Shipment\AgreeShipmentRequest;
use App\Http\Requests\Shipment\ShipmentStepRequest;
use App\Services\Fulfillment\ShipmentHandoffService;
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

    /**
     * Record this user's party agreement on a proposed slot.
     *
     * The party is inferred from the user's role and store unless supplied, and
     * is authorized either way: a courier cannot tick for the origin dock, and
     * a keeper at the destination cannot tick for the origin.
     */
    protected function agreeAsParty(
        AgreeShipmentRequest $request,
        Shipment $shipment,
        ShipmentWorkflowService $workflow,
    ): RedirectResponse {
        if (! $this->shipmentIsInScope($shipment)) {
            abort(403, 'That shipment does not involve your store.');
        }

        $user = Auth::user();
        $permitted = $workflow->partiesFor($shipment, $user);

        if ($permitted === []) {
            abort(403, 'You are not a party to this shipment.');
        }

        $party = $request->validated('party') ?? $this->preferredParty($permitted);

        if (! in_array($party, $permitted, true)) {
            abort(403, "You cannot agree on behalf of the {$party} party.");
        }

        try {
            $shipment = $workflow->recordPartyAgreement(
                $shipment,
                (string) $party,
                $workflow->normaliseSlot($request->slot()) ?? $request->slot(),
                $user,
                $request->stance(),
            );
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['slot' => $e->getMessage()]);
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        $outstanding = $workflow->outstandingParties($shipment);

        return back()->with(
            'success',
            $outstanding === []
                ? "All parties agreed — {$shipment->reference} is scheduled."
                : 'Agreement recorded. Still awaiting: ' . implode(', ', $outstanding) . '.'
        );
    }

    /**
     * One hand-off step after scheduling — pick, prepare, check, sign.
     *
     * Every role posts here; ShipmentHandoffService decides whether this user
     * may take the step and whether it applies right now.
     */
    public function step(ShipmentStepRequest $request, Shipment $shipment): RedirectResponse
    {
        if (! $this->shipmentIsInScope($shipment)) {
            abort(403, 'That shipment does not involve you.');
        }

        $step = (string) $request->validated('step');

        try {
            $shipment = app(ShipmentHandoffService::class)->perform($shipment, $step, Auth::user(), $request->payload());
        } catch (\Illuminate\Auth\Access\AuthorizationException $e) {
            abort(403, $e->getMessage());
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['step' => $e->getMessage()])->with('error', $e->getMessage());
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        if ($step === ShipmentHandoffService::PICK_LINE) {
            return back();
        }

        return back()->with('success', match ($step) {
            ShipmentHandoffService::START_PICKING => "Picking started for {$shipment->reference}.",
            ShipmentHandoffService::PREPARED => "{$shipment->reference} is prepared for pickup.",
            ShipmentHandoffService::COURIER_START => 'Trip started — the origin can see you are on the way.',
            ShipmentHandoffService::COURIER_CHECK => 'Load checked. Sign to take it.',
            ShipmentHandoffService::COURIER_SIGN => "Signed — {$shipment->reference} is en route.",
            ShipmentHandoffService::COURIER_ARRIVE => 'Arrival recorded. The receiving dock checks and signs it in.',
            ShipmentHandoffService::RECEIVER_CHECK => 'Goods checked. Sign to receive them.',
            ShipmentHandoffService::RECEIVER_SIGN => "Received — {$shipment->reference} is finished.",
            default => 'Done.',
        });
    }

    /**
     * When a user could act for more than one party, tick the one that is most
     * specific to their role first.
     *
     * @param  array<int, string>  $permitted
     */
    private function preferredParty(array $permitted): string
    {
        foreach ([
            ShipmentWorkflowService::PARTY_FLEET,
            ShipmentWorkflowService::PARTY_ORIGIN,
            ShipmentWorkflowService::PARTY_DESTINATION,
            ShipmentWorkflowService::PARTY_CREATOR,
        ] as $candidate) {
            if (in_array($candidate, $permitted, true)) {
                return $candidate;
            }
        }

        return $permitted[0];
    }

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
     * A shipment is in scope when the shared visibility rule says this user can
     * see it. Defined once in ShipmentWorkflowService so every role agrees.
     */
    protected function shipmentIsInScope(Shipment $shipment): bool
    {
        return app(ShipmentWorkflowService::class)->isVisibleTo($shipment, Auth::user());
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
