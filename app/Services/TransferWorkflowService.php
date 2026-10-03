<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\MovementDomainException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Services\Fulfillment\MovementDomainService;
use App\Services\Inventory\StockScope;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Lifecycle of a stock transfer: queued → in transit → completed.
 *
 * Stock leaves the origin at dispatch and lands at the destination on
 * completion, so units are never counted in two places at once.
 *
 * Two rules are enforced here rather than left to callers:
 *
 *   Domain    a Transfer is localized balancing. At least one end must be
 *             store-level, so warehouse-to-warehouse freight is refused and
 *             pointed at the Shipment domain instead.
 *
 *   Approval  a transfer the capacity planner proposed cannot be dispatched
 *             until a store manager has approved it. The check is here, not only
 *             in the policy, so no route can bypass it.
 *
 * @see \App\Services\Fulfillment\MovementDomainService
 * @see \App\Services\Inventory\ReplenishmentProposalService
 */
class TransferWorkflowService
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_IN_TRANSIT = 'in_transit';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_CANCELLED = 'cancelled';

    public function __construct(
        private readonly MovementDomainService $domain,
        private readonly StockService $stock,
        private readonly StockScope $scope,
    ) {
    }

    /**
     * Raise a transfer. It holds no stock until it is dispatched.
     *
     * The endpoints may be given at any level: omit them and the transfer moves
     * between the two stores as a whole, which is what every existing caller
     * means. Supply them and the stock moves out of (and into) that exact shelf,
     * back room or warehouse.
     *
     * @throws MovementDomainException when both ends are warehouses — that is a
     *                                 Shipment, not a Transfer
     */
    public function create(
        int $variantId,
        ?int $fromStoreId,
        ?int $toStoreId,
        int $quantity,
        ?int $initiatedBy = null,
        ?string $notes = null,
        ?string $sourceLocationType = null,
        ?int $sourceLocationId = null,
        ?string $destinationLocationType = null,
        ?int $destinationLocationId = null,
        ?int $storeVariantId = null,
        ?int $courierId = null,
    ): Transfer {
        $sourceLocationType ??= Store::class;
        $sourceLocationId ??= $fromStoreId;
        $destinationLocationType ??= Store::class;
        $destinationLocationId ??= $toStoreId;

        if ($sourceLocationId === null || $destinationLocationId === null) {
            throw new \InvalidArgumentException('A transfer needs an origin and a destination.');
        }

        // Named locations carry their store; a shared hub has none.
        $fromStoreId ??= $this->domain->describe($sourceLocationType, $sourceLocationId)['store_id'];
        $toStoreId ??= $this->domain->describe($destinationLocationType, $destinationLocationId)['store_id'];

        $this->domain->assertTransferLeg(
            $sourceLocationType,
            $sourceLocationId,
            $destinationLocationType,
            $destinationLocationId,
        );

        return Transfer::create([
            'reference' => $this->nextReference(),
            'item_variant_id' => $variantId,
            'store_variant_id' => $storeVariantId,
            'from_store_id' => $fromStoreId,
            'to_store_id' => $toStoreId,
            'source_location_type' => $sourceLocationType,
            'source_location_id' => $sourceLocationId,
            'destination_location_type' => $destinationLocationType,
            'destination_location_id' => $destinationLocationId,
            'quantity' => $quantity,
            'origin' => Transfer::ORIGIN_MANUAL,
            // Hand-raised: the person raising it is the approval.
            'approval_state' => Transfer::APPROVAL_NOT_REQUIRED,
            'status' => self::STATUS_PENDING,
            'initiated_by' => $initiatedBy,
            'courier_id' => $courierId,
            'notes' => $notes,
        ]);
    }

    /**
     * A courier takes on a transfer between two sites. Any delivery user may
     * claim one that has no courier yet; it is theirs from then on.
     */
    public function assignCourier(Transfer $transfer, User $courier, bool $override = false): bool
    {
        if ($courier->roleKey() !== 'delivery') {
            throw new MovementDomainException('Only a delivery courier can carry a transfer.', MovementDomainService::DOMAIN_TRANSFER);
        }

        return DB::transaction(function () use ($transfer, $courier): bool {
            $locked = Transfer::query()->whereKey($transfer->id)->lockForUpdate()->first(['id', 'status', 'courier_id']);

            if ($locked === null
                || in_array($locked->status, [self::STATUS_COMPLETED, self::STATUS_CANCELLED], true)
                || ($locked->courier_id !== null && (int) $locked->courier_id !== (int) $courier->id
                    // An admin may reassign a transfer nobody has collected yet.
                    && ! ($override && $locked->status === self::STATUS_PENDING))) {
                return false;
            }

            $transfer->update(['courier_id' => $courier->id]);

            return true;
        });
    }

    /** Does this transfer leave its site (so a courier has to carry it)? */
    public function needsCourier(Transfer $transfer): bool
    {
        [$fromType, $fromId] = $this->sourceEndpoint($transfer);
        [$toType, $toId] = $this->destinationEndpoint($transfer);

        return ! $this->leaf($fromType, $fromId)->sameSiteAs($this->leaf($toType, $toId));
    }

    /**
     * Dispatch: the origin hands the goods over and they leave it now.
     *
     * Between two sites they go into the named courier's custody ("In
     * Delivery"), so a transfer that needs a courier cannot leave without one.
     * Within one store (floor ↔ shelf) staff carry it across themselves.
     *
     * Refused while an automated proposal is still awaiting approval — the
     * whole point of raising it unapproved.
     *
     * @param  User|null  $actor  checked against the origin's managers; null = system
     */
    public function markDispatched(Transfer $transfer, ?User $actor = null): bool
    {
        if ($transfer->status !== self::STATUS_PENDING || $transfer->awaitsApproval()) {
            return false;
        }

        return DB::transaction(function () use ($transfer, $actor): bool {
            if (! $this->lockAtStatus($transfer, self::STATUS_PENDING)) {
                return false;
            }

            $transfer->refresh();
            [$type, $id] = $this->sourceEndpoint($transfer);
            $origin = $this->leaf($type, $id);

            $this->assertMayOperate($origin, $actor, 'hand stock out of');

            if ($transfer->courier_id === null && $this->needsCourier($transfer)) {
                throw new MovementDomainException(
                    'This transfer leaves the site, so a courier has to carry it. Assign one from Delivery first.',
                    MovementDomainService::DOMAIN_TRANSFER,
                );
            }

            // Refused, not clamped, when the origin is short (STOCK_PLAN.md
            // acceptance test 3): InsufficientStockException reaches the caller.
            $this->stock->handToCourier(
                (int) $transfer->item_variant_id,
                $origin,
                (int) $transfer->quantity,
                $transfer->courier_id !== null ? (int) $transfer->courier_id : null,
                $this->context($transfer, 'Transfer dispatched', $actor),
            );

            $transfer->update([
                'status' => self::STATUS_IN_TRANSIT,
                'dispatched_at' => now(),
            ]);

            return true;
        });
    }

    /**
     * Completion: the courier (or whoever carried it) hands the goods to the
     * destination, which takes them in.
     *
     * @param  User|null  $actor  the transfer's courier, or someone who may operate the destination; null = system
     */
    public function markCompleted(Transfer $transfer, ?User $actor = null): bool
    {
        if ($transfer->status !== self::STATUS_IN_TRANSIT) {
            return false;
        }

        return DB::transaction(function () use ($transfer, $actor): bool {
            if (! $this->lockAtStatus($transfer, self::STATUS_IN_TRANSIT)) {
                return false;
            }

            $transfer->refresh();
            [$type, $id] = $this->destinationEndpoint($transfer);
            $destination = $this->leaf($type, $id);

            $isCourier = $actor !== null && $transfer->courier_id !== null && (int) $transfer->courier_id === (int) $actor->id;

            if (! $isCourier) {
                $this->assertMayOperate($destination, $actor, 'take stock into');
            }

            $this->stock->handOverFromCourier(
                (int) $transfer->item_variant_id,
                $destination,
                (int) $transfer->quantity,
                $transfer->courier_id !== null ? (int) $transfer->courier_id : null,
                $this->context($transfer, 'Transfer received', $actor),
            );

            $transfer->update([
                'status' => self::STATUS_COMPLETED,
                'completed_at' => now(),
            ]);

            return true;
        });
    }

    /**
     * Cancel. Stock already handed to a courier is brought back to the origin.
     */
    public function cancel(Transfer $transfer, ?int $cancelledBy = null): bool
    {
        if (in_array($transfer->status, [self::STATUS_COMPLETED, self::STATUS_CANCELLED], true)) {
            return false;
        }

        return DB::transaction(function () use ($transfer, $cancelledBy): bool {
            $status = Transfer::query()->whereKey($transfer->id)->lockForUpdate()->value('status');

            if (in_array($status, [self::STATUS_COMPLETED, self::STATUS_CANCELLED], true)) {
                return false;
            }

            $transfer->refresh();

            if ($status === self::STATUS_IN_TRANSIT) {
                [$type, $id] = $this->sourceEndpoint($transfer);

                $this->stock->returnFromCourier(
                    (int) $transfer->item_variant_id,
                    $this->leaf($type, $id),
                    (int) $transfer->quantity,
                    $transfer->courier_id !== null ? (int) $transfer->courier_id : null,
                    ['reason' => 'Transfer cancelled in transit', 'reference' => $transfer, 'user_id' => $cancelledBy],
                );
            }

            $transfer->update([
                'status' => self::STATUS_CANCELLED,
                'cancelled_at' => now(),
                'cancelled_by' => $cancelledBy,
            ]);

            return true;
        });
    }

    /**
     * @return array<string, int>
     */
    public function statusCounts(): array
    {
        $counts = Transfer::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $awaitingApproval = Transfer::query()->awaitingApproval()->count();

        return [
            'all' => (int) $counts->sum(),
            // Proposals are counted separately so a board does not present
            // unapproved suggestions as work the floor should pick up.
            'awaiting_approval' => $awaitingApproval,
            self::STATUS_PENDING => max(0, (int) ($counts[self::STATUS_PENDING] ?? 0) - $awaitingApproval),
            self::STATUS_IN_TRANSIT => (int) ($counts[self::STATUS_IN_TRANSIT] ?? 0),
            self::STATUS_COMPLETED => (int) ($counts[self::STATUS_COMPLETED] ?? 0),
            self::STATUS_CANCELLED => (int) ($counts[self::STATUS_CANCELLED] ?? 0),
        ];
    }

    /**
     * @return array<string, mixed>
     */
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
            'quantity' => (int) $transfer->quantity,
            'status' => (string) $transfer->status,
            'ui_status' => $transfer->ui_status,
            'origin' => (string) $transfer->origin,
            'approval_state' => (string) $transfer->approval_state,
            'awaits_approval' => $transfer->awaitsApproval(),
            'observed_quantity' => $transfer->observed_quantity !== null ? (int) $transfer->observed_quantity : null,
            'min_capacity' => $transfer->min_capacity !== null ? (int) $transfer->min_capacity : null,
            'max_capacity' => $transfer->max_capacity !== null ? (int) $transfer->max_capacity : null,
            'from_store' => $transfer->fromStore?->name,
            'to_store' => $transfer->toStore?->name,
            'source_label' => $source === null ? null : $source['label'] . ' · ' . $source['name'],
            'destination_label' => $destination === null ? null : $destination['label'] . ' · ' . $destination['name'],
            'initiated_by' => trim((string) ($transfer->initiator?->first_name . ' ' . $transfer->initiator?->last_name)) ?: null,
            'approved_by' => trim((string) ($transfer->approver?->first_name . ' ' . $transfer->approver?->last_name)) ?: null,
            'approved_at' => $transfer->approved_at?->toIso8601String(),
            'notes' => $transfer->notes,
            'courier' => $transfer->courier_id !== null
                ? (trim((string) ($transfer->courier?->first_name.' '.$transfer->courier?->last_name)) ?: 'Courier #'.$transfer->courier_id)
                : null,
            'courier_id' => $transfer->courier_id !== null ? (int) $transfer->courier_id : null,
            'needs_courier' => $this->needsCourierSafely($transfer),
            'dispatched_at' => $transfer->dispatched_at?->toIso8601String(),
            'completed_at' => $transfer->completed_at?->toIso8601String(),
            'cancelled_at' => $transfer->cancelled_at?->toIso8601String(),
            'created_at' => $transfer->created_at?->toIso8601String(),
        ];
    }

    /** needsCourier() for display: an endpoint that no longer resolves reads as "no". */
    private function needsCourierSafely(Transfer $transfer): bool
    {
        try {
            return $this->needsCourier($transfer);
        } catch (\InvalidArgumentException) {
            return false;
        }
    }

    /**
     * Re-read the transfer's status under a row lock, so two people pressing
     * Dispatch at once cannot both move its stock.
     */
    private function lockAtStatus(Transfer $transfer, string $expected): bool
    {
        $status = Transfer::query()->whereKey($transfer->id)->lockForUpdate()->value('status');

        return $status === $expected;
    }

    /** The leaf an endpoint books into; a store as a whole means its floor. */
    private function leaf(string $type, int $id): StockLocation
    {
        return $this->scope->leafFor($type, $id)
            ?? throw new \InvalidArgumentException("Transfer endpoint {$type}#{$id} is not a place stock can sit.");
    }

    /** @return array<string, mixed> */
    private function context(Transfer $transfer, string $reason, ?User $actor = null): array
    {
        return array_filter([
            'reason' => $reason,
            'reference' => $transfer,
            'user_id' => $actor?->id,
        ], fn ($value) => $value !== null);
    }

    /**
     * A location with managers is operated by them (and admins) only.
     *
     * @throws MovementDomainException
     */
    private function assertMayOperate(StockLocation $location, ?User $actor, string $verb): void
    {
        if ($actor !== null && ! $location->canBeOperatedBy($actor)) {
            throw new MovementDomainException(
                "Only {$location->name}'s managers can {$verb} it.",
                MovementDomainService::DOMAIN_TRANSFER,
            );
        }
    }

    /**
     * Where the stock actually leaves from.
     *
     * Rows written before the polymorphic endpoints existed carry only
     * from_store_id, which is exactly the store-level reading they always had.
     *
     * @return array{0: string, 1: int}
     */
    private function sourceEndpoint(Transfer $transfer): array
    {
        if ($transfer->source_location_type !== null && $transfer->source_location_id !== null) {
            return [(string) $transfer->source_location_type, (int) $transfer->source_location_id];
        }

        return [Store::class, (int) $transfer->from_store_id];
    }

    /**
     * @return array{0: string, 1: int}
     */
    private function destinationEndpoint(Transfer $transfer): array
    {
        if ($transfer->destination_location_type !== null && $transfer->destination_location_id !== null) {
            return [(string) $transfer->destination_location_type, (int) $transfer->destination_location_id];
        }

        return [Store::class, (int) $transfer->to_store_id];
    }

    private function nextReference(): string
    {
        return 'TRF-' . now()->format('ymd') . '-' . Str::upper(Str::random(5));
    }
}
