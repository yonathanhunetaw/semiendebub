<?php

declare(strict_types=1);

namespace App\Http\Controllers\Delivery;

use App\Http\Controllers\Concerns\DrivesShipments;
use App\Http\Controllers\Controller;
use App\Http\Requests\Shipment\AgreeShipmentRequest;
use App\Http\Requests\Shipment\TransitionShipmentRequest;
use App\Models\Fulfillment\Shipment;
use App\Services\ShipmentWorkflowService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The courier's segment of a shipment: claim a dispatched load, carry it, and
 * hand it over.
 *
 * Distinct from DeliveryController, which handles last-mile `deliveries` tied
 * to a customer sale. This is inter-store freight.
 */
class FreightController extends Controller
{
    use DrivesShipments;

    public function __construct(private readonly ShipmentWorkflowService $workflow)
    {
    }

    protected function shipmentRole(): string
    {
        return 'delivery';
    }

    /** A courier is not store-bound; ownership is enforced per shipment. */
    protected function shipmentStoreScope(): ?array
    {
        return null;
    }

    /**
     * The courier's freight board.
     *
     * Serves `scheduled_transfers` in the same ScheduledTransfer shape the
     * Seller screen uses, so Delivery/Shipments/index.tsx can reuse that exact
     * card + filter-chip UI.
     */
    /**
     * The courier's freight board.
     *
     * Previously this only listed runs already assigned to them plus the
     * claimable pool, so a shipment awaiting the *fleet* agreement never
     * appeared — leaving the gate impossible to clear. It now shows everything
     * the courier may act on.
     */
    public function index(Request $request): Response
    {
        $courierId = (int) Auth::id();
        // Default to everything this courier may act on. Defaulting to "mine"
        // hid every freshly opened shipment, so nothing ever reached the fleet
        // party of the agreement gate.
        $tab = $request->string('tab')->toString() ?: 'all';

        $query = $this->workflow->visibleQuery(Auth::user())
            ->with(['origin', 'destination', 'courier', 'creator', 'items.itemVariant.item'])
            ->where('status', '!=', ShipmentWorkflowService::CANCELLED);

        if ($tab === 'available') {
            // Unclaimed and still open — anything they could take on.
            $query->whereNull('courier_id');
        } elseif ($tab === 'mine') {
            $query->where('courier_id', $courierId);
        }

        $shipments = $query
            ->orderBy('scheduled_for')
            ->orderByDesc('id')
            ->get()
            ->filter(fn (Shipment $s) => $this->workflow->hasLegacyStatus($s));

        return Inertia::render('Delivery/Shipments/index', [
            'scheduled_transfers' => $shipments
                ->map(fn (Shipment $s) => $this->workflow->presentAsScheduledTransfer($s))
                ->values()
                ->all(),
            'tab' => $tab,
            'available_count' => (clone $this->workflow->visibleQuery(Auth::user()))
                ->whereNull('courier_id')
                ->whereNotIn('status', [ShipmentWorkflowService::RECEIVED, ShipmentWorkflowService::CANCELLED])
                ->count(),
        ]);
    }

    /**
     * One freight run in detail, reached from the card on the index.
     */
    public function show(Shipment $shipment): Response
    {
        return Inertia::render('Delivery/Shipments/Show', [
            'shipment' => $this->workflow->present($shipment, 'delivery'),
            'is_mine' => (int) $shipment->courier_id === (int) Auth::id(),
        ]);
    }

    public function claim(Shipment $shipment): RedirectResponse
    {
        if (! $this->workflow->claim($shipment, Auth::user())) {
            return back()->with('error', 'That run has already been taken.');
        }

        return back()->with('success', "Run {$shipment->reference} assigned to you.");
    }

    public function transition(TransitionShipmentRequest $request, Shipment $shipment): RedirectResponse
    {
        // A courier may only drive a run assigned to them.
        if ((int) $shipment->courier_id !== (int) Auth::id()) {
            abort(403, 'That run is not assigned to you.');
        }

        return $this->driveShipment($request, $shipment, $this->workflow);
    }

    /**
     * Tick this role's party agreement on a proposed slot.
     */
    public function agree(AgreeShipmentRequest $request, Shipment $shipment): RedirectResponse
    {
        return $this->agreeAsParty($request, $shipment, $this->workflow);
    }
}
