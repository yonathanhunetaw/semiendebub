<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Auth\User;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCapacity;
use App\Services\Fulfillment\MovementDomainService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Turns a breached capacity band into a Transfer nobody has agreed to yet.
 *
 * The planner's whole job is to notice and to suggest — never to move stock. A
 * proposal is written with `status = pending` and `approval_state = pending`,
 * and TransferWorkflowService::markDispatched() refuses it while that second
 * flag stands. So the floor cannot action a machine's idea, and the store
 * manager's approval is what admits it to the active transfer list.
 *
 * Domain boundaries are respected rather than bent: a breach at a warehouse
 * that could only be filled from another warehouse is bulk freight, so no
 * Transfer is written for it at all. Those come back as `shipment_candidates`
 * for the Shipment builder to pick up.
 */
class ReplenishmentProposalService
{
    public function __construct(
        private readonly MovementDomainService $domain,
        private readonly LocationCapacityService $capacity,
    ) {
    }

    /*
    |--------------------------------------------------------------------------
    | Sweeping
    |--------------------------------------------------------------------------
    */

    /**
     * Look at every monitored band and propose what is missing.
     *
     * @param  array<int, int>  $storeVariantIds  narrow the sweep; empty means all
     * @return array{created: array<int, Transfer>, shipment_candidates: array<int, array<string, mixed>>, skipped: array<int, array<string, mixed>>}
     */
    public function sweep(array $storeVariantIds = []): array
    {
        $created = [];
        $shipmentCandidates = [];
        $skipped = [];

        foreach ($this->capacity->breaches($storeVariantIds) as $breach) {
            $outcome = $this->propose($breach['capacity'], (int) $breach['on_hand']);

            match ($outcome['result']) {
                'created' => $created[] = $outcome['transfer'],
                'shipment_required' => $shipmentCandidates[] = $outcome,
                default => $skipped[] = $outcome,
            };
        }

        return [
            'created' => $created,
            'shipment_candidates' => $shipmentCandidates,
            'skipped' => $skipped,
        ];
    }

    /**
     * Breaches that can only be filled warehouse-to-warehouse, inspected
     * without writing anything.
     *
     * The approvals screen lists these beside the proposals so a manager can see
     * the whole shortfall picture, and a screen must not create records as a side
     * effect of being looked at — which is why this does not call propose().
     *
     * @param  array<int, int>  $storeVariantIds
     * @return array<int, array<string, mixed>>
     */
    public function shipmentCandidates(array $storeVariantIds = []): array
    {
        $candidates = [];

        foreach ($this->capacity->breaches($storeVariantIds) as $breach) {
            $capacity = $breach['capacity'];
            $storeVariant = $capacity->storeVariant;

            if ($storeVariant === null || $storeVariant->store === null || $breach['shortfall'] <= 0) {
                continue;
            }

            $destination = $this->domain->describe((string) $capacity->location_type, (int) $capacity->location_id);
            $source = $this->findSource($storeVariant, $destination, (int) $breach['shortfall']);

            if ($source === null) {
                continue;
            }

            if ($this->domain->domainFor($source['node'], $destination) !== MovementDomainService::DOMAIN_SHIPMENT) {
                continue;
            }

            $candidates[] = [
                'capacity' => $capacity,
                'on_hand' => (int) $breach['on_hand'],
                'shortfall' => (int) $breach['shortfall'],
                'source' => $source['node'],
                'destination' => $destination,
                'reason' => 'Both ends are warehouses — this must be raised as a Shipment.',
            ];
        }

        return $candidates;
    }

    /**
     * Propose a top-up for one breached band.
     *
     * @return array{result: string, transfer?: Transfer, reason?: string, capacity: StoreVariantCapacity, on_hand: int, shortfall: int, destination: array<string, mixed>, source?: array<string, mixed>}
     */
    public function propose(StoreVariantCapacity $capacity, int $onHand): array
    {
        $storeVariant = $capacity->storeVariant;
        $destination = $this->domain->describe((string) $capacity->location_type, (int) $capacity->location_id);
        $shortfall = $capacity->shortfallFrom($onHand);

        $base = [
            'capacity' => $capacity,
            'on_hand' => $onHand,
            'shortfall' => $shortfall,
            'destination' => $destination,
        ];

        if ($storeVariant === null || $storeVariant->store === null) {
            return $base + ['result' => 'skipped', 'reason' => 'The variant is no longer attached to a store.'];
        }

        if ($shortfall <= 0) {
            return $base + ['result' => 'skipped', 'reason' => 'Already at or above its ceiling.'];
        }

        // One open proposal per location is enough; a second would double the
        // top-up the moment both were approved.
        if ($this->hasOpenRequest($capacity)) {
            return $base + ['result' => 'skipped', 'reason' => 'A transfer for this location is already open.'];
        }

        $source = $this->findSource($storeVariant, $destination, $shortfall);

        if ($source === null) {
            return $base + ['result' => 'skipped', 'reason' => 'No location holds stock to draw from.'];
        }

        // Warehouse → warehouse is bulk freight. Refusing to write it as a
        // Transfer is the point of the domain rule, not an edge case.
        if ($this->domain->domainFor($source['node'], $destination) === MovementDomainService::DOMAIN_SHIPMENT) {
            return $base + [
                'result' => 'shipment_required',
                'reason' => 'Both ends are warehouses — this must be raised as a Shipment.',
                'source' => $source['node'],
            ];
        }

        $quantity = min($shortfall, (int) $source['available']);

        $transfer = DB::transaction(fn (): Transfer => Transfer::create([
            'reference' => $this->nextReference(),
            'item_variant_id' => $storeVariant->item_variant_id,
            'store_variant_id' => $storeVariant->id,
            'from_store_id' => $source['node']['store_id'],
            'to_store_id' => $destination['store_id'] ?? $storeVariant->store_id,
            'source_location_type' => $source['node']['type'],
            'source_location_id' => $source['node']['id'],
            'destination_location_type' => $destination['type'],
            'destination_location_id' => $destination['id'],
            'quantity' => $quantity,
            'origin' => Transfer::ORIGIN_AUTO,
            'approval_state' => Transfer::APPROVAL_PENDING,
            'status' => 'pending',
            'observed_quantity' => $onHand,
            'min_capacity' => (int) $capacity->min_capacity,
            'max_capacity' => (int) $capacity->max_capacity,
            'initiated_by' => null,
            'notes' => sprintf(
                '%s held %d, at or below its minimum of %d. Proposed top-up to %d from %s.',
                $destination['label'],
                $onHand,
                $capacity->min_capacity,
                $capacity->max_capacity,
                $source['node']['label'],
            ),
        ]));

        Log::info('Replenishment transfer proposed', [
            'transfer_id' => $transfer->id,
            'store_variant_id' => $storeVariant->id,
            'destination' => $destination['label'],
            'quantity' => $quantity,
        ]);

        return $base + ['result' => 'created', 'transfer' => $transfer, 'source' => $source['node']];
    }

    /*
    |--------------------------------------------------------------------------
    | The store manager's decision
    |--------------------------------------------------------------------------
    */

    /**
     * Admit a proposal to the active transfer list.
     *
     * The quantity stays adjustable here because approval is the moment a
     * person looks at it: a manager who knows only 20 will fit says 20.
     */
    public function approve(Transfer $transfer, User $approver, ?int $quantity = null): bool
    {
        if (! $transfer->awaitsApproval()) {
            return false;
        }

        $transfer->update(array_filter([
            'approval_state' => Transfer::APPROVAL_APPROVED,
            'approved_by' => $approver->id,
            'approved_at' => now(),
            'quantity' => $quantity !== null && $quantity > 0 ? $quantity : null,
        ], fn (mixed $value): bool => $value !== null));

        Log::info('Replenishment transfer approved', [
            'transfer_id' => $transfer->id,
            'approved_by' => $approver->id,
            'quantity' => $transfer->quantity,
        ]);

        return true;
    }

    /**
     * Turn a proposal down. It is cancelled rather than deleted so the next
     * sweep does not simply raise it again without anyone seeing why it was
     * refused the first time.
     */
    public function reject(Transfer $transfer, User $rejecter, ?string $reason = null): bool
    {
        if (! $transfer->awaitsApproval()) {
            return false;
        }

        $transfer->update([
            'approval_state' => Transfer::APPROVAL_REJECTED,
            'rejected_by' => $rejecter->id,
            'rejected_at' => now(),
            'rejection_reason' => $reason,
            'status' => 'cancelled',
            'cancelled_at' => now(),
            'cancelled_by' => $rejecter->id,
        ]);

        return true;
    }

    /*
    |--------------------------------------------------------------------------
    | Presentation
    |--------------------------------------------------------------------------
    */

    /**
     * Proposals a manager still has to rule on.
     *
     * @return array<int, array<string, mixed>>
     */
    public function pendingProposals(?int $storeId = null): array
    {
        $query = Transfer::query()
            ->awaitingApproval()
            ->with(['itemVariant.item', 'itemVariant.itemColor', 'itemVariant.itemSize', 'fromStore', 'toStore'])
            ->orderByDesc('id');

        if ($storeId !== null) {
            $query->where('to_store_id', $storeId);
        }

        return $query->get()->map(fn (Transfer $transfer): array => $this->present($transfer))->all();
    }

    /** @return array<string, mixed> */
    public function present(Transfer $transfer): array
    {
        $variant = $transfer->itemVariant;

        $source = $transfer->source_location_type !== null
            ? $this->domain->describe((string) $transfer->source_location_type, (int) $transfer->source_location_id)
            : null;

        $destination = $transfer->destination_location_type !== null
            ? $this->domain->describe((string) $transfer->destination_location_type, (int) $transfer->destination_location_id)
            : null;

        return [
            'id' => (int) $transfer->id,
            'reference' => (string) $transfer->reference,
            'product_name' => (string) ($variant?->item?->product_name ?? 'Unknown product'),
            'sku' => $variant?->sku,
            'variant_label' => collect([
                $variant?->itemColor?->name,
                $variant?->itemSize?->name,
            ])->filter()->join(' / ') ?: 'Standard',
            'quantity' => (int) $transfer->quantity,
            'observed_quantity' => $transfer->observed_quantity !== null ? (int) $transfer->observed_quantity : null,
            'min_capacity' => $transfer->min_capacity !== null ? (int) $transfer->min_capacity : null,
            'max_capacity' => $transfer->max_capacity !== null ? (int) $transfer->max_capacity : null,
            'origin' => (string) $transfer->origin,
            'approval_state' => (string) $transfer->approval_state,
            'status' => (string) $transfer->status,
            'ui_status' => $transfer->ui_status,
            'source' => $source === null ? null : [
                'label' => $source['label'],
                'name' => $source['name'],
                'kind' => $source['kind'],
            ],
            'destination' => $destination === null ? null : [
                'label' => $destination['label'],
                'name' => $destination['name'],
                'kind' => $destination['kind'],
            ],
            'from_store' => $transfer->fromStore?->name,
            'to_store' => $transfer->toStore?->name,
            'notes' => $transfer->notes,
            'created_at' => $transfer->created_at?->toIso8601String(),
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    /**
     * The nearest place holding stock of this variant, other than the
     * destination itself.
     *
     * Walks the destination store's hierarchy outward — shop floor, back room,
     * store, remote warehouse, main warehouse — and takes the first node with
     * anything on hand. "Nearest with stock" beats "nearest that can cover it
     * completely": a partial top-up from the back room is better than a full one
     * from the hub, and the next sweep will propose the remainder.
     *
     * @param  array<string, mixed>  $destination
     * @return array{node: array<string, mixed>, available: int}|null
     */
    private function findSource(StoreVariant $storeVariant, array $destination, int $shortfall): ?array
    {
        $store = $storeVariant->store;

        if (! $store instanceof Store) {
            return null;
        }

        $candidates = $this->domain->hierarchyFor($store);

        // Only ever pull from further away than the place that ran short.
        $candidates = array_filter(
            $candidates,
            fn (array $node): bool => $node['proximity'] > ($destination['proximity'] ?? 0)
                && ! ($node['type'] === $destination['type'] && $node['id'] === $destination['id']),
        );

        foreach ($candidates as $node) {
            $available = $this->capacity->onHand(
                (int) $storeVariant->item_variant_id,
                (string) $node['type'],
                (int) $node['id'],
            );

            // Leave a source's own floor intact where it has one: robbing a
            // shelf to fill a back room would only trigger the reverse proposal.
            $sourceBand = $storeVariant->capacityAt((string) $node['type'], (int) $node['id']);
            $spare = $sourceBand !== null
                ? max(0, $available - (int) $sourceBand->min_capacity)
                : $available;

            if ($spare > 0) {
                return ['node' => $node, 'available' => $spare];
            }
        }

        return null;
    }

    /**
     * Is there already a transfer heading for this location?
     *
     * Covers both an unapproved proposal and an approved one that has not yet
     * landed, since either will raise the on-hand figure when it completes.
     */
    private function hasOpenRequest(StoreVariantCapacity $capacity): bool
    {
        return Transfer::query()
            ->where('store_variant_id', $capacity->store_variant_id)
            ->where('destination_location_type', $capacity->location_type)
            ->where('destination_location_id', $capacity->location_id)
            ->whereIn('status', ['pending', 'in_transit'])
            ->exists();
    }

    private function nextReference(): string
    {
        return 'RPL-' . now()->format('ymd') . '-' . Str::upper(Str::random(5));
    }
}
