<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\Transfer;
use App\Services\TransferWorkflowService;
use Illuminate\Support\Collection;

/**
 * The refill screens' read side: the store manager's suggestion list, the
 * Replenishment Manifest panel above the shipment builder, and the stock
 * keeper's shelving list with what became of their requests. Writes go through
 * RefillEngine and RefillWorkflow; this class only presents.
 */
class RefillBoard
{
    private const RELATIONS = [
        'item:id,product_name',
        'target:id,name,kind',
        'raiser:id,first_name,last_name',
        'approver:id,first_name,last_name',
        'canceller:id,first_name,last_name',
        'transfer:id,reference,status',
        'shipment:id,reference,status,scheduled_for,agreed_scheduled_for',
    ];

    public function __construct(
        private readonly PackagingLadder $ladder,
        private readonly ShelfMatrix $matrix,
        private readonly StockPermissions $permissions,
        private readonly RefillWorkflow $workflow,
    ) {
    }

    /*
    |--------------------------------------------------------------------------
    | The store manager's list
    |--------------------------------------------------------------------------
    */

    /**
     * A store's Remote Hub and shipment legs: suggestions first (urgent
     * first), then what is on the Remote Hub list or a manifest, then the last
     * few closed ones.
     *
     * @return array{rows: array<int, array<string, mixed>>, counts: array<string, int>, hubs: array<int, array{id: int, name: string}>, destinations: array<int, array{id: int, name: string, kind: string}>, can_rule: bool}
     */
    public function waitingList(int $storeId, User $viewer): array
    {
        $escalations = RefillRequest::query()
            ->where('store_id', $storeId)
            ->whereIn('source', [ItemRefillRoute::SOURCE_REMOTE_HUB, ItemRefillRoute::SOURCE_SHIPMENT])
            ->with(self::RELATIONS);

        $open = (clone $escalations)->open()->orderByDesc('urgent')->orderBy('id')->get();
        $closed = (clone $escalations)
            ->whereIn('status', [RefillRequest::STATUS_FULFILLED, RefillRequest::STATUS_CANCELLED])
            ->orderByDesc('updated_at')
            ->limit(20)
            ->get();

        return [
            'rows' => $open->concat($closed)->map(fn (RefillRequest $leg): array => $this->presentLeg($leg, $viewer))->values()->all(),
            'counts' => [
                'pending' => $open->where('status', RefillRequest::STATUS_PENDING)->count(),
                'remote_to_accept' => $open->filter(fn (RefillRequest $leg): bool => $leg->awaitsHub())->count(),
                'in_progress' => $open->where('status', RefillRequest::STATUS_IN_PROGRESS)->count(),
                'urgent' => $open->where('status', RefillRequest::STATUS_PENDING)->where('urgent', true)->count(),
            ],
            'hubs' => $this->mainHubs(),
            'destinations' => StockLocation::query()
                ->where('store_id', $storeId)
                ->whereIn('kind', [StockLocation::KIND_BACKROOM, StockLocation::KIND_REMOTE_HUB])
                ->orderBy('kind')
                ->get(['id', 'name', 'kind'])
                ->map(fn (StockLocation $l): array => ['id' => (int) $l->id, 'name' => (string) $l->name, 'kind' => (string) $l->kind])
                ->all(),
            'can_rule' => $this->permissions->canRuleOnRefills($viewer, $storeId),
        ];
    }

    /**
     * The Replenishment Manifest panel: open suggestions this shipment could
     * take, and whether the viewer may add them. Empty when the shipment does
     * not leave a main hub for a store floor or Remote Hub.
     *
     * @return array{suggestions: array<int, array<string, mixed>>, can_add: bool, manifest_open: bool}
     */
    public function manifestPanel(Shipment $shipment, User $viewer, bool $manifestOpen): array
    {
        $destination = $shipment->destination_stock_location_id !== null ? StockLocation::query()->find($shipment->destination_stock_location_id) : null;
        $origin = $shipment->origin_stock_location_id !== null ? StockLocation::query()->find($shipment->origin_stock_location_id) : null;

        if ($destination === null || $origin === null || $origin->kind !== StockLocation::KIND_MAIN_HUB
            || ! in_array($destination->kind, [StockLocation::KIND_BACKROOM, StockLocation::KIND_REMOTE_HUB], true)) {
            return ['suggestions' => [], 'can_add' => false, 'manifest_open' => $manifestOpen];
        }

        return [
            'suggestions' => $this->workflow->suggestionsFor($destination)
                ->load(self::RELATIONS)
                ->map(fn (RefillRequest $leg): array => $this->presentLeg($leg, $viewer))
                ->values()
                ->all(),
            'can_add' => $manifestOpen && $this->permissions->canAddToManifest($viewer, (int) $destination->store_id),
            'manifest_open' => $manifestOpen,
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | The stock keeper's shelving list
    |--------------------------------------------------------------------------
    */

    /**
     * What a store's stock keeper has to do, and what became of their asks:
     *
     *   to_shelve    floor → shelf transfers not yet carried across
     *   to_accept    refills on the Remote Hub list for the hub to send
     *   needs        bins at or below their refill line with nothing on its way
     *   my_requests  suggestions raised for the store (by them or the auto
     *                trigger), with where each stands
     *
     * @return array<string, mixed>
     */
    public function shelvingList(int $storeId, User $viewer): array
    {
        $shelf = StockLocation::query()->where('store_id', $storeId)->where('kind', StockLocation::KIND_SHELF)->first();

        if ($shelf === null) {
            return ['shelf' => null, 'remote_hub' => null, 'to_shelve' => [], 'to_accept' => [], 'needs' => [], 'my_requests' => [], 'can_shelve' => false, 'can_raise' => false];
        }

        $legsByTransfer = RefillRequest::query()
            ->where('store_id', $storeId)
            ->where('source', ItemRefillRoute::SOURCE_FLOOR)
            ->whereNotNull('transfer_id')
            ->get(['id', 'reference', 'transfer_id', 'urgent', 'origin'])
            ->keyBy('transfer_id');

        $toShelve = Transfer::query()
            ->where('destination_location_type', StockLocation::class)
            ->where('destination_location_id', $shelf->id)
            ->whereIn('status', [TransferWorkflowService::STATUS_PENDING, TransferWorkflowService::STATUS_IN_TRANSIT])
            ->where('approval_state', '!=', Transfer::APPROVAL_PENDING)
            ->with('itemVariant.item:id,product_name')
            ->orderBy('id')
            ->get()
            ->map(function (Transfer $transfer) use ($legsByTransfer): array {
                $leg = $legsByTransfer->get($transfer->id);
                $itemId = (int) ($transfer->itemVariant?->item_id ?? 0);

                return [
                    'transfer_id' => (int) $transfer->id,
                    'reference' => (string) $transfer->reference,
                    'refill_reference' => $leg?->reference,
                    'urgent' => (bool) ($leg?->urgent ?? false),
                    'item_id' => $itemId,
                    'item_name' => (string) ($transfer->itemVariant?->item?->product_name ?? 'Unknown item'),
                    'quantity' => (int) $transfer->quantity,
                    'display' => $this->display((int) $transfer->item_variant_id, $itemId, (int) $transfer->quantity),
                    'status' => (string) $transfer->status,
                    'created_at' => $transfer->created_at?->toIso8601String(),
                ];
            })
            ->sortByDesc('urgent')
            ->values()
            ->all();

        $hub = StockLocation::query()->where('store_id', $storeId)->where('kind', StockLocation::KIND_REMOTE_HUB)->first();

        $toAccept = RefillRequest::query()
            ->where('store_id', $storeId)
            ->where('source', ItemRefillRoute::SOURCE_REMOTE_HUB)
            ->where('status', RefillRequest::STATUS_IN_PROGRESS)
            ->whereNull('transfer_id')
            ->with(self::RELATIONS)
            ->orderByDesc('urgent')
            ->orderBy('id')
            ->get()
            ->map(fn (RefillRequest $leg): array => $this->presentLeg($leg, $viewer))
            ->all();

        $openForShelf = RefillRequest::query()->open()->where('store_id', $storeId)
            ->where(fn ($q) => $q->where('target_location_id', $shelf->id)->orWhereNull('target_location_id'))
            ->distinct()->pluck('item_id')->map(fn ($id): int => (int) $id)->all();

        $needs = $this->matrix->bins($shelf)
            ->filter(fn (array $bin): bool => $bin['assigned']
                && in_array($bin['status'], ['empty', 'critical', 'refill'], true)
                && ! in_array($bin['item_id'], $openForShelf, true))
            ->map(fn (array $bin): array => [
                'item_id' => $bin['item_id'],
                'name' => $bin['name'],
                'status' => $bin['status'],
                'display' => $bin['display'],
                'in_unit' => $bin['in_unit'],
                'unit' => $bin['unit']['name'],
                'band' => $bin['band'],
            ])
            ->values()
            ->all();

        $myRequests = RefillRequest::query()
            ->where('store_id', $storeId)
            ->where('source', '!=', ItemRefillRoute::SOURCE_FLOOR)
            ->where(fn ($q) => $q->whereIn('status', RefillRequest::OPEN_STATUSES)->orWhere('updated_at', '>=', now()->subDays(7)))
            ->with(self::RELATIONS)
            ->orderByRaw("case when status in ('pending', 'approved', 'in_progress') then 0 else 1 end")
            ->orderByDesc('updated_at')
            ->limit(50)
            ->get()
            ->map(fn (RefillRequest $leg): array => $this->presentLeg($leg, $viewer))
            ->all();

        return [
            'shelf' => ['id' => (int) $shelf->id, 'name' => (string) $shelf->name],
            'remote_hub' => $hub === null ? null : ['id' => (int) $hub->id, 'name' => (string) $hub->name],
            'to_shelve' => $toShelve,
            'to_accept' => $toAccept,
            'needs' => $needs,
            'my_requests' => $myRequests,
            'can_shelve' => $this->permissions->canShelve($viewer, $shelf),
            'can_raise' => $this->permissions->canRaiseRefill($viewer, $shelf),
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Presenting one leg
    |--------------------------------------------------------------------------
    */

    /**
     * One leg, with what became of it in words a stock keeper reads: waiting,
     * on the Remote Hub list, on manifest SHP-… for a date, adjusted, cancelled.
     *
     * @return array<string, mixed>
     */
    public function presentLeg(RefillRequest $leg, User $viewer): array
    {
        $requested = (int) ($leg->requested_quantity ?? $leg->quantity);
        $scheduled = $leg->shipment?->agreed_scheduled_for ?? $leg->shipment?->scheduled_for;

        return [
            'id' => (int) $leg->id,
            'reference' => (string) $leg->reference,
            'item_id' => (int) $leg->item_id,
            'item_name' => (string) ($leg->item?->product_name ?? 'Unknown item'),
            'target' => $leg->target === null ? null : ['name' => (string) $leg->target->name, 'kind' => (string) $leg->target->kind],
            'source' => (string) $leg->source,
            'destination' => $leg->destination,
            'status' => (string) $leg->status,
            'stage' => $this->stage($leg),
            'urgent' => (bool) $leg->urgent,
            'origin' => (string) $leg->origin,
            'quantity' => (int) $leg->quantity,
            'requested_quantity' => $requested,
            'adjusted' => $leg->wasAdjusted(),
            'unit' => $this->unitName((int) $leg->item_variant_id, (int) $leg->item_id),
            'display' => $this->display((int) $leg->item_variant_id, (int) $leg->item_id, (int) $leg->quantity),
            'requested_display' => $this->display((int) $leg->item_variant_id, (int) $leg->item_id, $requested),
            'raised_by' => $this->nameOf($leg->raiser),
            'added_by' => $this->nameOf($leg->approver),
            'cancelled_by' => $this->nameOf($leg->canceller),
            'transfer' => $leg->transfer === null ? null : ['reference' => (string) $leg->transfer->reference, 'status' => (string) $leg->transfer->status],
            'shipment' => $leg->shipment === null ? null : [
                'id' => (int) $leg->shipment->id,
                'reference' => (string) $leg->shipment->reference,
                'status' => (string) $leg->shipment->status,
                'scheduled_for' => $scheduled?->toIso8601String(),
            ],
            'cancel_reason' => $leg->cancel_reason,
            'created_at' => $leg->created_at?->toIso8601String(),
            'can' => [
                'add_to_remote' => $viewer->can('addToRemoteList', $leg),
                'add_to_manifest' => $viewer->can('addToManifest', $leg),
                'update' => $viewer->can('update', $leg),
                'cancel' => $viewer->can('cancel', $leg),
                'accept' => $viewer->can('accept', $leg),
            ],
        ];
    }

    /**
     * Where the leg stands, as one key the screens word:
     * waiting · remote_list · remote_on_way · on_manifest · landed · cancelled.
     */
    private function stage(RefillRequest $leg): string
    {
        return match (true) {
            $leg->status === RefillRequest::STATUS_CANCELLED => 'cancelled',
            $leg->status === RefillRequest::STATUS_FULFILLED => 'landed',
            $leg->status === RefillRequest::STATUS_PENDING => 'waiting',
            $leg->awaitsHub() => 'remote_list',
            $leg->source === ItemRefillRoute::SOURCE_REMOTE_HUB => 'remote_on_way',
            $leg->shipment_id !== null => 'on_manifest',
            default => 'waiting',
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    /** @return array<int, array{id: int, name: string}> */
    private function mainHubs(): array
    {
        return StockLocation::query()
            ->where('kind', StockLocation::KIND_MAIN_HUB)
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (StockLocation $hub): array => ['id' => (int) $hub->id, 'name' => (string) $hub->name])
            ->all();
    }

    private function display(int $variantId, int $itemId, int $quantity): string
    {
        return $this->ladder->label($this->ladder->breakdown($quantity * $this->ladder->piecesPerUnit($variantId), $itemId));
    }

    /** The name of one unit of this variant's pack, e.g. "Packet". */
    private function unitName(int $variantId, int $itemId): string
    {
        $per = $this->ladder->piecesPerUnit($variantId);
        $tier = (new Collection($this->ladder->forItem($itemId)))->firstWhere('pieces', $per);

        return (string) ($tier['name'] ?? 'Unit');
    }

    private function nameOf(?User $user): ?string
    {
        if ($user === null) {
            return null;
        }

        $name = trim((string) ($user->first_name.' '.$user->last_name));

        return $name !== '' ? $name : null;
    }
}
