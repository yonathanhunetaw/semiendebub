<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Concerns\DrivesShipments;
use App\Http\Controllers\Controller;
use App\Http\Requests\Shipment\StoreShipmentItemRequest;
use App\Http\Requests\Shipment\StoreShipmentRequest;
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
        ]);
    }

    public function store(StoreShipmentRequest $request): RedirectResponse
    {
        try {
            $shipment = $this->workflow->create(
                (int) $request->validated('origin_store_id'),
                (int) $request->validated('destination_store_id'),
                collect($request->validated())
                    ->only(['scheduled_for', 'vehicle_name', 'vehicle_plate', 'vehicle_max_cbm', 'distance_km', 'slot', 'notes'])
                    ->filter(fn ($v) => $v !== null)
                    ->all(),
                Auth::id(),
            );
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['destination_store_id' => $e->getMessage()]);
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
            'draft' => (int) ($counts['draft'] ?? 0),
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
}
