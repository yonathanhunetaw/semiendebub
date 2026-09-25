<?php

declare(strict_types=1);

namespace App\Http\Controllers\Delivery;

use App\Http\Controllers\Concerns\DrivesShipments;
use App\Http\Controllers\Controller;
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

    public function index(Request $request): Response
    {
        $courierId = (int) Auth::id();
        $tab = $request->string('tab')->toString() ?: 'mine';

        $mine = Shipment::query()
            ->with(['origin', 'destination', 'items.itemVariant.item'])
            ->forCourier($courierId)
            ->whereIn('status', [
                ShipmentWorkflowService::DISPATCHED,
                ShipmentWorkflowService::IN_TRANSIT,
            ])
            ->orderBy('eta')
            ->get();

        $available = Shipment::query()
            ->with(['origin', 'destination', 'items'])
            ->claimable()
            ->orderBy('scheduled_for')
            ->limit(20)
            ->get();

        $completed = Shipment::query()
            ->with(['origin', 'destination'])
            ->forCourier($courierId)
            ->whereIn('status', [ShipmentWorkflowService::DELIVERED, ShipmentWorkflowService::RECEIVED])
            ->orderByDesc('delivered_at')
            ->limit(20)
            ->get();

        return Inertia::render('Delivery/Shipments/index', [
            'runs' => $mine->map(fn (Shipment $s) => $this->workflow->present($s, 'delivery'))->values()->all(),
            'available_runs' => $available->map(fn (Shipment $s) => $this->workflow->present($s, 'delivery'))->values()->all(),
            'completed_runs' => $completed->map(fn (Shipment $s) => $this->workflow->present($s, 'delivery'))->values()->all(),
            'filters' => ['tab' => $tab],
            'metrics' => [
                'assigned' => $mine->where('status', ShipmentWorkflowService::DISPATCHED)->count(),
                'in_transit' => $mine->where('status', ShipmentWorkflowService::IN_TRANSIT)->count(),
                'available' => $available->count(),
                'completed' => $completed->count(),
            ],
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
}
