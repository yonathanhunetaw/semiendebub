<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Concerns\DrivesShipments;
use App\Http\Controllers\Controller;
use App\Http\Requests\Shipment\AgreeShipmentRequest;
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

    /**
     * The warehouse shipment queue.
     *
     * Serves `scheduled_transfers` in the same ScheduledTransfer shape the
     * Seller screen uses, so StockKeeper/Shipments/index.tsx can reuse that
     * exact card + filter-chip UI.
     */
    /**
     * The warehouse shipment board.
     *
     * Shows every stage, not just the pick queue: the floor has to see a
     * shipment while the agreement gate is still open in order to tick the
     * origin or destination party on it.
     */
    public function index(Request $request): Response
    {
        // Default to both directions.
        //
        // This defaulted to `outbound`, and the toggle only ever flipped between
        // outbound and inbound — there was no way to see both. A seller raising a
        // replenishment creates a run that is *inbound* to their store, so the
        // keeper at that store opened their board and found nothing: the run they
        // were being asked to receive was one toggle away, with no indication it
        // existed. Their own dock's dispatches were all they could see.
        $direction = $request->string('direction')->toString();
        $direction = in_array($direction, ['inbound', 'outbound'], true) ? $direction : 'all';

        $storeId = auth()->user()?->store_id ? (int) auth()->user()->store_id : null;

        $query = $this->workflow->visibleQuery(auth()->user())
            ->with(['origin', 'destination', 'courier', 'creator', 'items.itemVariant.item'])
            ->where('status', '!=', ShipmentWorkflowService::CANCELLED);

        // A keeper posted to a facility can narrow to one dock; one covering
        // every dock sees the lot either way.
        if ($storeId !== null && $direction !== 'all') {
            $direction === 'inbound'
                ? $query->inboundTo($storeId)
                : $query->outboundFrom($storeId);
        }

        $shipments = $query
            ->orderBy('scheduled_for')
            ->orderByDesc('id')
            ->get()
            ->filter(fn (Shipment $s) => $this->workflow->hasLegacyStatus($s));

        return Inertia::render('StockKeeper/Shipments/index', [
            'scheduled_transfers' => $shipments
                ->map(fn (Shipment $s) => $this->workflow->presentAsScheduledTransfer($s))
                ->values()
                ->all(),
            'direction' => $direction,
            // Null for a keeper covering every dock, which is what makes the
            // direction filter meaningless for them.
            'store_id' => $storeId,
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

        return back()->with('success', "Handed over — stock deducted from {$shipment->origin?->name}.");
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

        return back()->with('success', "Received — stock credited to {$shipment->destination?->name}.");
    }
}
