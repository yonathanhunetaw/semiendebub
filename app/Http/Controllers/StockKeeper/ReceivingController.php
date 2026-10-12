<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Http\Controllers\StockKeeper\Concerns\KeeperScope;
use App\Http\Requests\StockKeeper\ResolveDiscrepancyRequest;
use App\Http\Requests\StockKeeper\ShipmentReceiptRequest;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\ReceiptDiscrepancy;
use App\Models\StockKeeper\Transfer;
use App\Services\Inventory\ReceivingService;
use App\Services\Inventory\StocktakeService;
use App\Services\ShipmentWorkflowService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;

/**
 * Receiving with discrepancies: the count of what arrived on a shipment, and
 * the list of shortfalls, damage and over-deliveries to settle.
 */
class ReceivingController extends Controller
{
    use KeeperScope;

    public function __construct(
        private readonly ReceivingService $receiving,
        private readonly ShipmentWorkflowService $workflow,
    ) {
    }

    public function index(Request $request): Response
    {
        $scope = $this->scopeIds($request->user());
        $status = $request->string('status')->toString() ?: 'open';

        $base = fn () => ReceiptDiscrepancy::query()
            ->when($scope !== null, fn ($q) => $q->whereIn('stock_location_id', $scope));

        $rows = $base()
            ->with(['itemVariant.item', 'location', 'courier', 'recorder', 'resolver', 'receivable'])
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->latest()
            ->limit(100)
            ->get();

        return Inertia::render('StockKeeper/Receiving/index', [
            'discrepancies' => $rows->map(fn (ReceiptDiscrepancy $r): array => [
                'id' => (int) $r->id,
                'reference' => (string) $r->reference,
                'kind' => (string) $r->kind,
                'status' => (string) $r->status,
                'resolution' => $r->resolution,
                'item' => ['id' => (int) ($r->itemVariant?->item_id ?? 0), 'name' => (string) ($r->itemVariant?->item?->product_name ?? 'Unknown item'), 'sku' => $r->itemVariant?->sku],
                'expected' => (int) $r->expected,
                'received' => (int) $r->received,
                'quantity' => (int) $r->quantity,
                'note' => $r->note,
                'resolution_note' => $r->resolution_note,
                'location' => (string) ($r->location?->name ?? ''),
                'courier' => StocktakeService::personName($r->courier),
                'recorded_by' => StocktakeService::personName($r->recorder),
                'resolved_by' => StocktakeService::personName($r->resolver),
                'source' => $this->source($r),
                'created_at' => $r->created_at?->toIso8601String(),
                'resolved_at' => $r->resolved_at?->toIso8601String(),
                'can_resolve' => $r->status === ReceiptDiscrepancy::OPEN && $this->receiving->canResolve($request->user(), $r),
            ])->values()->all(),
            'counts' => [
                'open' => $base()->where('status', ReceiptDiscrepancy::OPEN)->count(),
                'short' => $base()->where('status', ReceiptDiscrepancy::OPEN)->where('kind', ReceiptDiscrepancy::SHORT)->count(),
                'over' => $base()->where('status', ReceiptDiscrepancy::OPEN)->where('kind', ReceiptDiscrepancy::OVER)->count(),
                'resolved' => $base()->where('status', ReceiptDiscrepancy::RESOLVED)->count(),
            ],
            'filter' => $status,
        ]);
    }

    public function resolve(ResolveDiscrepancyRequest $request, ReceiptDiscrepancy $discrepancy): RedirectResponse
    {
        try {
            $this->receiving->resolve($discrepancy, $request->string('resolution')->toString(), $request->input('note'), $request->user());
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "{$discrepancy->reference} settled.");
    }

    /** The receiver's count on a shipment that has arrived, saved before signing it in. */
    public function shipmentReceipt(ShipmentReceiptRequest $request, Shipment $shipment): RedirectResponse
    {
        abort_unless($this->workflow->visibleQuery($request->user())->whereKey($shipment->id)->exists(), 403);

        if ($shipment->status !== ShipmentWorkflowService::DELIVERED) {
            return back()->with('error', 'Count the goods once the driver has arrived, before signing them in.');
        }

        $counts = collect($request->input('lines'))->keyBy(fn (array $line): int => (int) $line['item_variant_id'])->all();

        try {
            $this->receiving->recordShipmentCounts($shipment, $counts);
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Count saved. Sign the goods in to land them; any difference is logged under Receiving.');
    }

    /** @return array{type: string, reference: string, url: string|null} */
    private function source(ReceiptDiscrepancy $r): array
    {
        $receivable = $r->receivable;

        return match (true) {
            $receivable instanceof Shipment => ['type' => 'Shipment', 'reference' => (string) $receivable->reference, 'url' => route('stock_keeper.shipments.show', $receivable->id)],
            $receivable instanceof Transfer => ['type' => 'Transfer', 'reference' => (string) $receivable->reference, 'url' => route('stock_keeper.transfers.index')],
            default => ['type' => 'Movement', 'reference' => '', 'url' => null],
        };
    }
}
