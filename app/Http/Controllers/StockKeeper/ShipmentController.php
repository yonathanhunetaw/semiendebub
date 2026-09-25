<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Concerns\DrivesShipments;
use App\Http\Controllers\Controller;
use App\Http\Requests\Shipment\TransitionShipmentRequest;
use App\Models\Fulfillment\Shipment;
use App\Services\ShipmentWorkflowService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The warehouse floor's segment of a shipment: pick the manifest, then
 * dispatch it (stock leaves the origin), and confirm inbound loads on arrival
 * (stock lands at the destination).
 */
class ShipmentController extends Controller
{
    use DrivesShipments;

    public function __construct(private readonly ShipmentWorkflowService $workflow)
    {
    }

    protected function shipmentRole(): string
    {
        return 'stock_keeper';
    }

    /**
     * A stock keeper works one store. Where their account names no store they
     * see the whole board, since warehouse staff are not always store-bound.
     *
     * @return array<int, int>|null
     */
    protected function shipmentStoreScope(): ?array
    {
        $storeId = auth()->user()?->store_id;

        return $storeId ? [(int) $storeId] : null;
    }

    public function index(Request $request): Response
    {
        $direction = $request->string('direction')->toString() ?: 'outbound';
        $scope = $this->shipmentStoreScope();

        $query = Shipment::query()->with(['origin', 'destination', 'courier', 'items.itemVariant.item']);

        if ($scope !== null) {
            $storeId = $scope[0];
            $direction === 'inbound'
                ? $query->inboundTo($storeId)
                : $query->outboundFrom($storeId);
        }

        // Outbound is the pick/dispatch queue; inbound is what is landing.
        $query->whereIn(
            'status',
            $direction === 'inbound'
                ? [ShipmentWorkflowService::IN_TRANSIT, ShipmentWorkflowService::DELIVERED, ShipmentWorkflowService::RECEIVED]
                : [
                    ShipmentWorkflowService::SCHEDULED,
                    ShipmentWorkflowService::PICKING,
                    ShipmentWorkflowService::READY,
                    ShipmentWorkflowService::DISPATCHED,
                ],
        );

        $paginator = $query->orderBy('scheduled_for')->orderByDesc('id')->paginate(20)->withQueryString();

        return Inertia::render('StockKeeper/Shipments/index', [
            'shipments' => collect($paginator->items())
                ->map(fn (Shipment $s) => $this->workflow->present($s, 'stock_keeper'))
                ->values()
                ->all(),
            'filters' => ['direction' => $direction],
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function show(Shipment $shipment): Response
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        return Inertia::render('StockKeeper/Shipments/Show', [
            'shipment' => $this->workflow->present($shipment, 'stock_keeper'),
        ]);
    }

    /**
     * Record what was actually found on the shelf, line by line.
     */
    public function pick(Request $request, Shipment $shipment): RedirectResponse
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        $validated = $request->validate([
            'picked' => ['required', 'array', 'min:1'],
            'picked.*' => ['required', 'integer', 'min:0', 'max:1000000'],
        ]);

        // Keys are variant ids; they must belong to this manifest.
        $manifestVariantIds = $shipment->items()->pluck('item_variant_id')->all();
        $picked = [];

        foreach ($validated['picked'] as $variantId => $quantity) {
            if (! in_array((int) $variantId, $manifestVariantIds, true)) {
                throw ValidationException::withMessages([
                    'picked' => 'That SKU is not on this manifest.',
                ]);
            }

            $picked[(int) $variantId] = (int) $quantity;
        }

        try {
            $this->workflow->recordPick($shipment, $picked);
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Pick recorded.');
    }

    public function transition(TransitionShipmentRequest $request, Shipment $shipment): RedirectResponse
    {
        return $this->driveShipment($request, $shipment, $this->workflow);
    }
}
