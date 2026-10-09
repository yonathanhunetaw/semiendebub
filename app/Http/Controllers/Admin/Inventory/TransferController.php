<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Requests\StockKeeper\StoreTransferRequest;
use App\Models\Auth\User;
use App\Models\Inventory\InventoryMovement;
use App\Models\StockKeeper\Transfer;
use App\Services\Admin\ActiveStore;
use App\Services\StockKeeperService;
use App\Services\Fulfillment\MovementDomainService;
use App\Services\TransferWorkflowService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The active transfer board.
 *
 * Deliberately excludes automated proposals: they are suggestions, not work, and
 * live on ReplenishmentController's approvals queue until a store manager admits
 * them. Approving one is what makes it appear here.
 */
class TransferController extends Controller
{
    public function __construct(
        private readonly TransferWorkflowService $workflow,
        private readonly MovementDomainService $domain,
        private readonly ActiveStore $activeStore,
    ) {
    }

    /** Transfers with one of the active store(s) at either end. */
    private function scoped(): \Illuminate\Database\Eloquent\Builder
    {
        $ids = $this->activeStore->scopeIds();

        return Transfer::query()->when($ids !== null, fn ($q) => $q->where(fn ($ends) => $ends
            ->whereIn('from_store_id', $ids ?: [0])
            ->orWhereIn('to_store_id', $ids ?: [0])));
    }

    /** Another store's transfer is a 404 to a store admin. */
    private function authorizeTransfer(Transfer $transfer): void
    {
        abort_unless(Gate::allows('view', $transfer), 404);
    }

    public function index(): Response
    {
        $transfers = $this->scoped()
            ->active()
            ->with([
                'itemVariant.item',
                'itemVariant.itemColor',
                'itemVariant.itemSize',
                'fromStore',
                'toStore',
                'initiator',
            ])
            ->latest()
            ->get()
            ->map(fn (Transfer $transfer): array => [
                'id' => (int) $transfer->id,
                'reference' => (string) $transfer->reference,
                // Endpoint labels come from the movement domain, which can name
                // a shelf, a back room, a warehouse or a whole facility. The old
                // version read $t->fromLocation->name through a relation typed
                // against a class that does not exist, so it threw on every row
                // that had a location id at all.
                'from_location' => $this->endpointLabel(
                    $transfer->source_location_type,
                    $transfer->source_location_id,
                    $transfer->fromStore?->name,
                ),
                'to_location' => $this->endpointLabel(
                    $transfer->destination_location_type,
                    $transfer->destination_location_id,
                    $transfer->toStore?->name,
                ),
                'item_name' => (string) ($transfer->itemVariant?->item?->product_name ?? 'Unknown product'),
                'variant_label' => collect([
                    $transfer->itemVariant?->itemColor?->name,
                    $transfer->itemVariant?->itemSize?->name,
                ])->filter()->join(' / ') ?: 'Default',
                'sku' => $transfer->itemVariant?->sku,
                'quantity' => (int) $transfer->quantity,
                'status' => (string) $transfer->status,
                'origin' => (string) $transfer->origin,
                'initiated_by' => $transfer->initiator !== null
                    ? trim("{$transfer->initiator->first_name} {$transfer->initiator->last_name}")
                    : 'System',
                'created_at' => $transfer->created_at?->toISOString(),
                'completed_at' => $transfer->completed_at?->toISOString(),
            ]);

        return Inertia::render('Admin/Inventory/Transfers/index', [
            'transfers' => $transfers,
            'pendingCount' => $transfers->where('status', 'pending')->count(),
            'inTransitCount' => $transfers->where('status', 'in_transit')->count(),
            'completedCount' => $transfers->where('status', 'completed')->count(),
            // Suggestions waiting on a manager, so the board can link to them.
            'awaitingApprovalCount' => $this->activeStore->apply(Transfer::query()->awaitingApproval(), 'to_store_id')->count(),
        ]);
    }

    /** Raise a transfer between any two places in the location tree. */
    public function create(StockKeeperService $stock): Response
    {
        return Inertia::render('Admin/Inventory/Transfers/Create', [
            'locations' => $stock->locations(),
            'variants' => $stock->variantOptions()->all(),
            'couriers' => $this->couriers(),
        ]);
    }

    public function store(StoreTransferRequest $request): RedirectResponse
    {
        // A store admin moves stock into or out of their own stores only.
        $from = $request->validated('from_store_id');
        $to = $request->validated('to_store_id');
        abort_unless(
            $this->activeStore->isGlobal()
                || ($from !== null && $this->activeStore->allows((int) $from))
                || ($to !== null && $this->activeStore->allows((int) $to)),
            403,
            'A transfer must start or end at one of your stores.',
        );

        $transfer = $this->workflow->create(
            variantId: (int) $request->validated('item_variant_id'),
            fromStoreId: $request->validated('from_store_id') !== null ? (int) $request->validated('from_store_id') : null,
            toStoreId: $request->validated('to_store_id') !== null ? (int) $request->validated('to_store_id') : null,
            quantity: (int) $request->validated('quantity'),
            initiatedBy: $request->user()?->id,
            notes: $request->validated('notes'),
            sourceLocationType: $request->validated('source_location_type'),
            sourceLocationId: $request->validated('source_location_id') !== null ? (int) $request->validated('source_location_id') : null,
            destinationLocationType: $request->validated('destination_location_type'),
            destinationLocationId: $request->validated('destination_location_id') !== null ? (int) $request->validated('destination_location_id') : null,
            courierId: $request->validated('courier_id') !== null ? (int) $request->validated('courier_id') : null,
        );

        return redirect()->route('admin.inventory.transfers.show', $transfer)
            ->with('success', "Transfer {$transfer->reference} raised.");
    }

    /**
     * One transfer: where it goes, who carries it, and every stock movement
     * it has made (the custody journal).
     */
    public function show(Transfer $transfer): Response
    {
        $this->authorizeTransfer($transfer);

        $transfer->load(['itemVariant.item', 'fromStore', 'toStore', 'initiator', 'courier']);

        $journal = InventoryMovement::query()
            ->with(['stockLocation', 'user'])
            ->where('reference_type', $transfer->getMorphClass())
            ->where('reference_id', (string) $transfer->id)
            ->orderBy('id')
            ->get()
            ->map(fn (InventoryMovement $row): array => [
                'id' => (int) $row->id,
                'type' => (string) $row->type,
                'quantity' => (int) $row->quantity,
                'balance_after' => $row->balance_after,
                'location' => $row->stockLocation?->name,
                'reason' => $row->reason,
                'by' => $row->user ? trim($row->user->first_name.' '.$row->user->last_name) : null,
                'at' => $row->created_at?->toIso8601String(),
            ])
            ->values();

        return Inertia::render('Admin/Inventory/Transfers/Show', [
            'transfer' => $this->workflow->present($transfer),
            'journal' => $journal,
            'couriers' => $this->couriers(),
        ]);
    }

    public function dispatchTransfer(Transfer $transfer): RedirectResponse
    {
        $this->authorizeTransfer($transfer);

        if (! $this->workflow->markDispatched($transfer, request()->user())) {
            return back()->with('error', 'Only a pending, approved transfer can be dispatched.');
        }

        return back()->with('success', "Transfer {$transfer->reference} handed over and on its way.");
    }

    public function assignCourier(\Illuminate\Http\Request $request, Transfer $transfer): RedirectResponse
    {
        $this->authorizeTransfer($transfer);

        $courier = User::query()->findOrFail((int) $request->validate([
            'courier_id' => ['required', 'integer', 'exists:users,id'],
        ])['courier_id']);

        if (! $this->workflow->assignCourier($transfer, $courier, override: true)) {
            return back()->with('error', 'A collected transfer keeps its courier.');
        }

        return back()->with('success', "{$courier->first_name} will carry {$transfer->reference}.");
    }

    /** @return array<int, array{id: int, name: string}> */
    private function couriers(): array
    {
        return User::role('delivery')
            ->orderBy('first_name')
            ->get(['users.id', 'first_name', 'last_name', 'email'])
            ->map(fn (User $user): array => [
                'id' => (int) $user->id,
                'name' => trim($user->first_name.' '.$user->last_name) ?: (string) $user->email,
            ])
            ->values()
            ->all();
    }

    /**
     * Mark a transfer received.
     *
     * Routed through the workflow service so the stock lands at the recorded
     * destination — shelf, back room, warehouse or store. The previous version
     * adjusted quantities through `$transfer->fromLocation->stockLines()`, a
     * relation no model defines.
     */
    public function complete(Transfer $transfer): RedirectResponse
    {
        $this->authorizeTransfer($transfer);

        if ($transfer->status === TransferWorkflowService::STATUS_PENDING) {
            // A transfer that never left cannot land. Dispatch it first so the
            // origin is debited before the destination is credited.
            if (! $this->workflow->markDispatched($transfer, request()->user())) {
                return back()->with('error', 'This transfer cannot be dispatched yet.');
            }

            $transfer->refresh();
        }

        if (! $this->workflow->markCompleted($transfer, request()->user())) {
            return back()->with('error', 'Only a transfer in transit can be completed.');
        }

        return back()->with('success', "Transfer {$transfer->reference} marked as completed.");
    }

    public function cancel(Transfer $transfer): RedirectResponse
    {
        $this->authorizeTransfer($transfer);

        if (! $this->workflow->cancel($transfer, request()->user()?->id)) {
            return back()->with('error', 'A completed transfer cannot be cancelled.');
        }

        return back()->with('success', "Transfer {$transfer->reference} cancelled.");
    }

    /** "Store Back Room · Main Store", or the store name when no level is recorded. */
    private function endpointLabel(?string $locationType, ?int $locationId, ?string $fallback): string
    {
        if ($locationType === null || $locationId === null) {
            return $fallback ?? 'Unknown';
        }

        $node = $this->domain->describe($locationType, $locationId);

        return $node['label'] . ' · ' . $node['name'];
    }
}
