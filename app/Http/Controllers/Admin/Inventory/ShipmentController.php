<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Concerns\DrivesShipments;
use App\Http\Controllers\Controller;
use App\Http\Requests\Shipment\StoreShipmentItemRequest;
use App\Http\Requests\Shipment\StoreShipmentRequest;
use App\Http\Requests\Shipment\AgreeShipmentRequest;
use App\Http\Requests\Shipment\AssignShipmentFleetRequest;
use App\Http\Requests\Shipment\TransitionShipmentRequest;
use App\Models\Fulfillment\Shipment;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\ShipmentWorkflowService;
use App\Services\StockKeeperService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin owns the whole shipment board: raise a run, build its manifest,
 * schedule it, and override any stage.
 */
class ShipmentController extends Controller
{
    use DrivesShipments;

    public function __construct(
        private readonly ShipmentWorkflowService $workflow,
        private readonly StockKeeperService $stock,
    ) {
    }

    protected function shipmentRole(): string
    {
        return 'admin';
    }

    /** Admin is unrestricted. */
    protected function shipmentStoreScope(): ?array
    {
        return null;
    }

    public function index(Request $request): Response
    {
        $status = $request->string('status')->toString() ?: 'all';

        $query = Shipment::query()->with(['origin', 'destination', 'courier', 'creator', 'items']);

        if ($status === 'open') {
            $query->open();
        } elseif ($status !== 'all') {
            $query->where('status', $status);
        }

        $paginator = $query->orderByDesc('id')->paginate(20)->withQueryString();

        return Inertia::render('Admin/Inventory/Shipments/index', [
            'shipments' => collect($paginator->items())
                ->map(fn (Shipment $s) => $this->workflow->present($s, 'admin'))
                ->values()
                ->all(),
            'counts' => $this->statusCounts(),
            'filters' => ['status' => $status],
            'stores' => Store::query()->orderBy('name')->get(['id', 'name', 'location']),
            // Freight runs from a Main Hub to a store floor or a Remote Hub.
            'origins' => \App\Models\Inventory\StockLocation::query()
                ->ofKind(\App\Models\Inventory\StockLocation::KIND_MAIN_HUB)->orderBy('name')->get(['id', 'name'])
                ->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name])->values(),
            'destinations' => \App\Models\Inventory\StockLocation::query()
                ->ofKind(\App\Models\Inventory\StockLocation::KIND_BACKROOM, \App\Models\Inventory\StockLocation::KIND_REMOTE_HUB)
                ->with('store')->get()
                ->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->kind === 'backroom' ? (($l->store?->name ?? $l->name).' — Store') : ($l->name.' — Remote Hub')])
                ->sortBy('name')->values(),
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function show(Shipment $shipment): Response
    {
        return Inertia::render('Admin/Inventory/Shipments/Show', [
            'shipment' => $this->workflow->present($shipment, 'admin'),
            'variants' => $this->stock->variantOptions()->all(),
            'vehicle_options' => $this->workflow->vehicleOptions($shipment),
            'courier_options' => $this->workflow->courierOptions(),
        ]);
    }

    /**
     * The car the run goes in and the drivers it is offered to. Only those
     * drivers see it in Delivery and may agree to a time.
     */
    public function fleet(AssignShipmentFleetRequest $request, Shipment $shipment): RedirectResponse
    {
        try {
            $this->workflow->assignFleet($shipment, $request->vehicleId(), $request->courierIds());
        } catch (\RuntimeException | \InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Fleet for {$shipment->reference} saved.");
    }

    public function store(StoreShipmentRequest $request): RedirectResponse
    {
        try {
            $shipment = $this->workflow->createBetween(
                $request->originLocation(),
                $request->destinationLocation(),
                collect($request->validated())
                    ->only(['scheduled_for', 'schedule_options', 'vehicle_name', 'vehicle_plate', 'vehicle_max_cbm', 'vehicle_id', 'distance_km', 'slot', 'notes'])
                    ->filter(fn ($v) => $v !== null)
                    ->when($request->filled('courier_ids'), fn ($c) => $c->put('eligible_courier_ids', $request->validated('courier_ids')))
                    ->all(),
                Auth::id(),
            );
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['destination_location_id' => $e->getMessage()]);
        }

        return redirect()
            ->route('admin.inventory.shipments.show', $shipment)
            ->with('success', "Shipment {$shipment->reference} opened.");
    }

    public function addItem(StoreShipmentItemRequest $request, Shipment $shipment): RedirectResponse
    {
        $variant = ItemVariant::findOrFail((int) $request->validated('item_variant_id'));

        try {
            $this->workflow->addItem(
                $shipment,
                $variant,
                (int) $request->validated('quantity'),
                collect($request->validated())
                    ->only(['cbm', 'weight_kg', 'unit', 'location'])
                    ->filter(fn ($v) => $v !== null)
                    ->all(),
            );
        } catch (\RuntimeException | \InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Manifest updated.');
    }

    public function removeItem(Shipment $shipment, ItemVariant $variant): RedirectResponse
    {
        try {
            $this->workflow->removeItem($shipment, $variant);
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Line removed from manifest.');
    }

    public function transition(TransitionShipmentRequest $request, Shipment $shipment): RedirectResponse
    {
        return $this->driveShipment($request, $shipment, $this->workflow);
    }

    /**
     * @return array<string, int>
     */
    private function statusCounts(): array
    {
        $counts = Shipment::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return [
            'all' => (int) $counts->sum(),
            'open' => (int) $counts->except(['received', 'cancelled'])->sum(),
            'draft' => (int) ($counts['draft'] ?? 0),
            // Omitted here and from the board's chip row, so the one status a
            // seller-raised run actually sits in had no count and no filter:
            // the runs most in need of an admin's attention were the runs the
            // admin board could not single out.
            'pending_agreement' => (int) ($counts['pending_agreement'] ?? 0),
            'scheduled' => (int) ($counts['scheduled'] ?? 0),
            'picking' => (int) ($counts['picking'] ?? 0),
            'ready' => (int) ($counts['ready'] ?? 0),
            'dispatched' => (int) ($counts['dispatched'] ?? 0),
            'in_transit' => (int) ($counts['in_transit'] ?? 0),
            'delivered' => (int) ($counts['delivered'] ?? 0),
            'received' => (int) ($counts['received'] ?? 0),
            'cancelled' => (int) ($counts['cancelled'] ?? 0),
        ];
    }

    /**
     * Tick this role's party agreement on a proposed slot.
     */
    public function agree(AgreeShipmentRequest $request, Shipment $shipment): RedirectResponse
    {
        return $this->agreeAsParty($request, $shipment, $this->workflow);
    }

    /**
     * Origin handover: the keeper hands the load to the driver.
     *
     * This is the moment stock leaves the origin ledger.
     */
    public function handover(Shipment $shipment): RedirectResponse
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        // advanceTo(), not transition(): `scheduled` cannot jump straight to
        // `dispatched`, so a bare transition here failed silently.
        try {
            $shipment = $this->workflow->advanceTo($shipment, ShipmentWorkflowService::DISPATCHED);
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Handed to the courier — stock left {$shipment->originLocation?->name}.");
    }

    /**
     * Destination receipt: the receiver inspects and accepts the goods.
     *
     * This is the moment stock is credited to the destination ledger.
     */
    public function receive(Shipment $shipment): RedirectResponse
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        try {
            $shipment = $this->workflow->advanceTo($shipment, ShipmentWorkflowService::RECEIVED);
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Received — stock credited to {$shipment->destinationLocation?->name}.");
    }
}
