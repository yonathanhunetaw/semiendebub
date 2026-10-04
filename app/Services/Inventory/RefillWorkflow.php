<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\Transfer;
use App\Services\ShipmentWorkflowService;
use App\Services\TransferWorkflowService;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use Throwable;

/**
 * What happens to a refill suggestion after RefillEngine raises it.
 *
 * A suggestion (pending) waits for the store manager, who either:
 *
 *   adds it to the Remote Hub list  → in_progress, waiting at the hub; the hub
 *                                     accepts and a Remote Hub → floor transfer
 *                                     goes to Delivery; fulfilled when it lands.
 *   adds it to a shipment manifest  → in_progress on that shipment, from Hub A/B
 *                                     to the store floor or to the store's
 *                                     Remote Hub; fulfilled when received.
 *   cancels it                      → cancelled, with a reason.
 *
 * Adding it is the approval; there is no separate approve step. The amount may
 * be changed while adding — `requested_quantity` keeps what was asked, so the
 * stock keeper can be told it was adjusted.
 *
 * A suggestion taken off a manifest (the line removed, or the shipment
 * cancelled) goes back to pending at the amount asked, and reappears on the
 * next manifest. Floor legs never wait: they are in progress from the start.
 *
 * When stock lands on the floor, the bin is looked at again so what arrived
 * goes onto the shelving list. Authorization is the caller's
 * (RefillRequestPolicy); this class keeps the states honest whoever calls it.
 */
class RefillWorkflow
{
    public function __construct(
        private readonly RefillEngine $engine,
        private readonly TransferWorkflowService $transfers,
        private readonly ShipmentWorkflowService $shipments,
    ) {
    }

    /*
    |--------------------------------------------------------------------------
    | The store manager
    |--------------------------------------------------------------------------
    */

    /**
     * Put a suggestion on the Remote Hub → Store list, optionally for a
     * different amount. The hub accepts it next.
     *
     * @throws InvalidArgumentException when it is not a suggestion, is a Remote Hub's own restock, or the store has no Remote Hub
     */
    public function addToRemoteList(RefillRequest $request, User $by, ?int $quantity = null): RefillRequest
    {
        return DB::transaction(function () use ($request, $by, $quantity): RefillRequest {
            $leg = $this->lockAt($request, [RefillRequest::STATUS_PENDING]);
            $this->assertSuggestion($leg);

            if ($leg->target?->kind === StockLocation::KIND_REMOTE_HUB) {
                throw new InvalidArgumentException('A Remote Hub restocks only by shipment from Hub A or B.');
            }

            $this->leaf($leg->store_id, StockLocation::KIND_REMOTE_HUB);

            $leg->update(array_filter([
                'source' => ItemRefillRoute::SOURCE_REMOTE_HUB,
                'destination' => null,
                'status' => RefillRequest::STATUS_IN_PROGRESS,
                'approved_by' => $by->id,
                'approved_at' => now(),
                'quantity' => $quantity !== null ? $this->validQuantity($quantity) : null,
            ], fn (mixed $value, string $key): bool => $value !== null || $key === 'destination', ARRAY_FILTER_USE_BOTH));

            return $leg;
        });
    }

    /**
     * Put suggestions on a shipment's manifest. The shipment must leave Hub A
     * or B and be bound for the store's floor or its Remote Hub; it decides
     * where they land. The manifest line merges as addItem() does.
     *
     * @param  array<int, int|null>  $quantities  refill request id → amount to send (null = as asked)
     * @return int  suggestions added
     *
     * @throws InvalidArgumentException when a request is not a suggestion of the shipment's store
     */
    public function addToManifest(Shipment $shipment, array $quantities, User $by): int
    {
        if ($quantities === []) {
            throw new InvalidArgumentException('Pick at least one suggestion to add.');
        }

        return DB::transaction(function () use ($shipment, $quantities, $by): int {
            $legs = RefillRequest::query()->whereIn('id', array_keys($quantities))->with('target')->lockForUpdate()->get();

            if ($legs->count() !== count($quantities)) {
                throw new InvalidArgumentException('One of those suggestions no longer exists.');
            }

            $destination = $this->shipments->destinationLeaf($shipment);
            $origin = $this->shipments->originLeaf($shipment);

            if ($origin->kind !== StockLocation::KIND_MAIN_HUB) {
                throw new InvalidArgumentException('Refills are shipped from Hub A or Hub B.');
            }

            $landsAt = match ($destination->kind) {
                StockLocation::KIND_BACKROOM => RefillRequest::DESTINATION_STORE,
                StockLocation::KIND_REMOTE_HUB => RefillRequest::DESTINATION_REMOTE_HUB,
                default => throw new InvalidArgumentException('A refill shipment goes to a store floor or a Remote Hub.'),
            };

            foreach ($legs as $leg) {
                if ($leg->status !== RefillRequest::STATUS_PENDING || ! $leg->needsApproval()) {
                    throw new InvalidArgumentException("{$leg->reference} is not a suggestion waiting for you.");
                }

                if ((int) $destination->store_id !== $leg->store_id) {
                    throw new InvalidArgumentException("{$leg->reference} is for another store.");
                }

                if ($leg->target?->kind === StockLocation::KIND_REMOTE_HUB && $landsAt !== RefillRequest::DESTINATION_REMOTE_HUB) {
                    throw new InvalidArgumentException("{$leg->reference} restocks the Remote Hub, so it has to go on a shipment to the hub.");
                }

                $amount = $quantities[$leg->id] !== null ? $this->validQuantity((int) $quantities[$leg->id]) : $leg->quantity;

                $this->shipments->addItem($shipment, $leg->itemVariant, $amount);

                $leg->update([
                    'source' => ItemRefillRoute::SOURCE_SHIPMENT,
                    'destination' => $landsAt,
                    'quantity' => $amount,
                    'status' => RefillRequest::STATUS_IN_PROGRESS,
                    'shipment_id' => $shipment->id,
                    'approved_by' => $by->id,
                    'approved_at' => now(),
                ]);
            }

            return $legs->count();
        });
    }

    /**
     * Build a shipment from Hub A or B to the store's floor or its Remote Hub
     * out of suggestions. This is the moment a hub is chosen for them.
     *
     * @param  array<int, int|null>  $quantities  refill request id → amount (null = as asked)
     */
    public function buildShipment(StockLocation $hub, StockLocation $destination, array $quantities, User $by): Shipment
    {
        if ($hub->kind !== StockLocation::KIND_MAIN_HUB) {
            throw new InvalidArgumentException('Shipments leave from Hub A or Hub B.');
        }

        if (! in_array($destination->kind, [StockLocation::KIND_BACKROOM, StockLocation::KIND_REMOTE_HUB], true)) {
            throw new InvalidArgumentException('A refill shipment goes to a store floor or a Remote Hub.');
        }

        return DB::transaction(function () use ($hub, $destination, $quantities, $by): Shipment {
            $shipment = $this->shipments->createBetween($hub, $destination, [], $by->id);

            $this->addToManifest($shipment, $quantities, $by);

            return $shipment->refresh();
        });
    }

    /** Change a suggestion's amount before it is added anywhere. */
    public function updateQuantity(RefillRequest $request, int $quantity): RefillRequest
    {
        return DB::transaction(function () use ($request, $quantity): RefillRequest {
            $leg = $this->lockAt($request, [RefillRequest::STATUS_PENDING]);
            $this->assertSuggestion($leg);

            $leg->update(['quantity' => $this->validQuantity($quantity)]);

            return $leg;
        });
    }

    /**
     * Cancel a suggestion, or take one off the Remote Hub list before the hub
     * accepts it. One on a manifest is taken off by removing its line first.
     */
    public function cancel(RefillRequest $request, User $by, ?string $reason = null): RefillRequest
    {
        return DB::transaction(function () use ($request, $by, $reason): RefillRequest {
            $leg = $this->lockAt($request, [RefillRequest::STATUS_PENDING, RefillRequest::STATUS_APPROVED, RefillRequest::STATUS_IN_PROGRESS]);
            $this->assertSuggestion($leg);

            if ($leg->status === RefillRequest::STATUS_IN_PROGRESS && ! $leg->awaitsHub()) {
                throw new InvalidArgumentException("{$leg->reference} is already on its way; remove it from its manifest or cancel its transfer instead.");
            }

            $leg->update([
                'status' => RefillRequest::STATUS_CANCELLED,
                'cancelled_by' => $by->id,
                'cancelled_at' => now(),
                'cancel_reason' => $reason,
            ]);

            return $leg;
        });
    }

    /*
    |--------------------------------------------------------------------------
    | The Remote Hub
    |--------------------------------------------------------------------------
    */

    /**
     * The hub agrees to send a leg on its list: a Remote Hub → store floor
     * transfer is raised for a courier to claim.
     *
     * @throws InvalidArgumentException when it is not on the Remote Hub list
     */
    public function accept(RefillRequest $request, User $by): RefillRequest
    {
        return DB::transaction(function () use ($request, $by): RefillRequest {
            $leg = $this->lockAt($request, [RefillRequest::STATUS_IN_PROGRESS, RefillRequest::STATUS_APPROVED]);

            if ($leg->source !== ItemRefillRoute::SOURCE_REMOTE_HUB || $leg->transfer_id !== null) {
                throw new InvalidArgumentException("{$leg->reference} is not waiting at the Remote Hub.");
            }

            [$hub, $floor] = [$this->leaf($leg->store_id, StockLocation::KIND_REMOTE_HUB), $this->leaf($leg->store_id, StockLocation::KIND_BACKROOM)];

            $transfer = $this->transfers->create(
                variantId: $leg->item_variant_id,
                fromStoreId: null,
                toStoreId: null,
                quantity: $leg->quantity,
                initiatedBy: $by->id,
                notes: "Refill {$leg->reference} for {$leg->item?->product_name}",
                sourceLocationType: StockLocation::class,
                sourceLocationId: (int) $hub->id,
                destinationLocationType: StockLocation::class,
                destinationLocationId: (int) $floor->id,
            );

            $leg->update([
                'status' => RefillRequest::STATUS_IN_PROGRESS,
                'transfer_id' => $transfer->id,
                'accepted_by' => $by->id,
                'accepted_at' => now(),
            ]);

            return $leg;
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Reading
    |--------------------------------------------------------------------------
    */

    /**
     * Open suggestions a manifest to this destination could take, urgent
     * first: the store's shelf suggestions, and — for a shipment to its Remote
     * Hub — the hub's own restocking too.
     *
     * @return EloquentCollection<int, RefillRequest>
     */
    public function suggestionsFor(StockLocation $destination): EloquentCollection
    {
        if ($destination->store_id === null) {
            return new EloquentCollection();
        }

        return RefillRequest::query()
            ->where('store_id', $destination->store_id)
            ->where('status', RefillRequest::STATUS_PENDING)
            ->where('source', '!=', ItemRefillRoute::SOURCE_FLOOR)
            ->when(
                $destination->kind !== StockLocation::KIND_REMOTE_HUB,
                fn ($q) => $q->whereDoesntHave('target', fn ($t) => $t->where('kind', StockLocation::KIND_REMOTE_HUB)),
            )
            ->with(['item:id,product_name', 'target:id,name,kind', 'raiser:id,first_name,last_name', 'itemVariant'])
            ->orderByDesc('urgent')
            ->orderBy('id')
            ->get();
    }

    /*
    |--------------------------------------------------------------------------
    | Following what carries a leg
    |--------------------------------------------------------------------------
    */

    /** Called when a transfer's status changes. */
    public function transferMoved(Transfer $transfer): void
    {
        $legs = RefillRequest::query()
            ->where('transfer_id', $transfer->id)
            ->where('status', RefillRequest::STATUS_IN_PROGRESS)
            ->get();

        foreach ($legs as $leg) {
            match ($transfer->status) {
                TransferWorkflowService::STATUS_COMPLETED => $this->fulfil($leg),
                TransferWorkflowService::STATUS_CANCELLED => $leg->source === ItemRefillRoute::SOURCE_FLOOR
                    ? $leg->update([
                        'status' => RefillRequest::STATUS_CANCELLED,
                        'cancelled_by' => $transfer->cancelled_by,
                        'cancelled_at' => now(),
                        'cancel_reason' => "Transfer {$transfer->reference} was cancelled.",
                    ])
                    // A Remote Hub transfer that never arrives: still wanted.
                    : $this->backToSuggestion($leg, "Transfer {$transfer->reference} was cancelled."),
                default => null,
            };
        }
    }

    /** Called when a shipment's status changes. */
    public function shipmentMoved(Shipment $shipment): void
    {
        $legs = RefillRequest::query()
            ->where('shipment_id', $shipment->id)
            ->where('status', RefillRequest::STATUS_IN_PROGRESS)
            ->get();

        foreach ($legs as $leg) {
            match ($shipment->status) {
                ShipmentWorkflowService::RECEIVED => $this->fulfil($leg),
                ShipmentWorkflowService::CANCELLED => $this->backToSuggestion($leg, "Shipment {$shipment->reference} was cancelled."),
                default => null,
            };
        }
    }

    /** A line left a manifest: its suggestions are wanted again. */
    public function manifestLineRemoved(int $shipmentId, int $variantId): void
    {
        RefillRequest::query()
            ->where('shipment_id', $shipmentId)
            ->where('item_variant_id', $variantId)
            ->where('status', RefillRequest::STATUS_IN_PROGRESS)
            ->get()
            ->each(fn (RefillRequest $leg) => $this->backToSuggestion($leg, 'Taken off the manifest.'));
    }

    /** A line moved to another open manifest: its suggestions go with it. */
    public function manifestLineMoved(int $fromShipmentId, int $toShipmentId, int $variantId): void
    {
        RefillRequest::query()
            ->where('shipment_id', $fromShipmentId)
            ->where('item_variant_id', $variantId)
            ->where('status', RefillRequest::STATUS_IN_PROGRESS)
            ->update(['shipment_id' => $toShipmentId]);
    }

    /** Back to the manager's list at the amount asked for. */
    private function backToSuggestion(RefillRequest $leg, string $why): void
    {
        $leg->update([
            'status' => RefillRequest::STATUS_PENDING,
            'shipment_id' => null,
            'transfer_id' => null,
            'quantity' => $leg->requested_quantity ?? $leg->quantity,
            'approved_by' => null,
            'approved_at' => null,
            'accepted_by' => null,
            'accepted_at' => null,
            'notes' => trim(($leg->notes ? $leg->notes."\n" : '').$why),
        ]);
    }

    /**
     * Mark a leg done. A leg that landed on the store floor (or at the Remote
     * Hub, on its way to the shelf) means the shelf is looked at again so what
     * arrived moves on.
     */
    private function fulfil(RefillRequest $leg): void
    {
        $leg->update(['status' => RefillRequest::STATUS_FULFILLED, 'fulfilled_at' => now()]);

        $target = $leg->target ?? $leg->shelf;

        if ($leg->source === ItemRefillRoute::SOURCE_FLOOR || $target === null || $leg->item === null
            || $target->kind !== StockLocation::KIND_SHELF) {
            return;
        }

        try {
            $this->engine->raise($target, $leg->item, RefillRequest::ORIGIN_AUTO);
        } catch (Throwable $e) {
            // The goods have landed either way; the next stock change or a
            // stock keeper will raise the next step.
            Log::warning('Refill after goods landed failed', [
                'refill_request_id' => $leg->id,
                'exception' => $e->getMessage(),
            ]);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    /**
     * Re-read the leg under a row lock and insist on its status, so two people
     * acting on it at once cannot both succeed.
     *
     * @param  array<int, string>  $statuses
     */
    private function lockAt(RefillRequest $request, array $statuses): RefillRequest
    {
        $leg = RefillRequest::query()->whereKey($request->id)->lockForUpdate()->firstOrFail();

        if (! in_array($leg->status, $statuses, true)) {
            throw new InvalidArgumentException("{$leg->reference} is already ".str_replace('_', ' ', $leg->status).'.');
        }

        return $leg;
    }

    private function assertSuggestion(RefillRequest $leg): void
    {
        if (! $leg->needsApproval()) {
            throw new InvalidArgumentException('A refill from the store floor never waits for a manager.');
        }
    }

    private function validQuantity(int $quantity): int
    {
        if ($quantity < 1) {
            throw new InvalidArgumentException('Quantity must be at least one.');
        }

        return $quantity;
    }

    private function leaf(int $storeId, string $kind): StockLocation
    {
        return StockLocation::query()->where('store_id', $storeId)->where('kind', $kind)->first()
            ?? throw new InvalidArgumentException('This store has no '.(StockLocation::kindLabels()[$kind] ?? $kind).'.');
    }
}
