<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Models\Fulfillment\Vehicle;
use App\Services\ShipmentWorkflowService;
use Illuminate\Http\RedirectResponse;
use App\Http\Requests\Fleet\SaveVehicleRequest;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The fleet: the cars a shipment can be carried in.
 *
 * A shipment's creator picks one of these on the Fleet step. Retiring a car
 * keeps it on the runs that already use it; deleting is refused while any
 * open run does.
 */
class FleetController extends Controller
{
    public function index(): Response
    {
        $open = [
            ShipmentWorkflowService::DRAFT,
            ShipmentWorkflowService::PENDING_AGREEMENT,
            ShipmentWorkflowService::SCHEDULED,
            ShipmentWorkflowService::PICKING,
            ShipmentWorkflowService::READY,
            ShipmentWorkflowService::DISPATCHED,
            ShipmentWorkflowService::IN_TRANSIT,
        ];

        return Inertia::render('Admin/Inventory/Fleet/index', [
            'vehicles' => Vehicle::query()
                ->withCount(['shipments as open_runs' => fn ($q) => $q->whereIn('status', $open)])
                ->orderBy('name')
                ->get()
                ->map(fn (Vehicle $v): array => [
                    'id' => (int) $v->id,
                    'name' => $v->name,
                    'plate' => $v->plate,
                    'max_cbm' => (float) $v->max_cbm,
                    'payload_kg' => (int) $v->payload_kg,
                    'status' => $v->status,
                    'notes' => $v->notes,
                    'open_runs' => (int) $v->open_runs,
                ])->values(),
        ]);
    }

    public function store(SaveVehicleRequest $request): RedirectResponse
    {
        $vehicle = Vehicle::query()->create($request->vehicleData());

        return back()->with('success', "{$vehicle->name} ({$vehicle->plate}) added to the fleet.");
    }

    public function update(SaveVehicleRequest $request, Vehicle $vehicle): RedirectResponse
    {
        $vehicle->update($request->vehicleData());

        return back()->with('success', "{$vehicle->name} ({$vehicle->plate}) updated.");
    }

    public function destroy(Vehicle $vehicle): RedirectResponse
    {
        if ($vehicle->shipments()->whereNotIn('status', [ShipmentWorkflowService::RECEIVED, ShipmentWorkflowService::CANCELLED])->exists()) {
            return back()->with('error', "{$vehicle->plate} is on an open run. Retire it instead.");
        }

        $vehicle->delete();

        return back()->with('success', "{$vehicle->plate} removed from the fleet.");
    }
}
