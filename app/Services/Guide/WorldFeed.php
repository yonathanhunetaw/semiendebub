<?php

declare(strict_types=1);

namespace App\Services\Guide;

use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Shipment;
use App\Models\Fulfillment\ShipmentItem;
use App\Models\Inventory\FloorArea;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Stocktake;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\Transfer;
use App\Services\Fulfillment\ShipmentHandoffService;
use App\Services\Inventory\RefillBoard;
use App\Services\Inventory\ShelfMatrix;
use App\Services\Inventory\StockLocationTree;
use App\Services\ShipmentWorkflowService;
use App\Services\TransferWorkflowService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * What the Live Operations world replays: shipments, refills and orders, each
 * with the time of every tick and physical step, and each end mapped onto a
 * place in the world (resources/js/Components/Guide/world/places.ts).
 *
 *   main_hub "… A" / "… B"   → main_hub_a / main_hub_b
 *   the Main Store's Remote Hub → remote_hub
 *   the Main Store's shelf or floor → store_floor
 *
 * A shipment between places the world doesn't draw comes back with a null
 * place; the client lists it but cannot animate it.
 */
class WorldFeed
{
    private const MAIN_STORE = 'Main Store';

    /** The physical steps, in order: the column, and what the world calls it. */
    private const STEPS = [
        'picked_at' => 'picked',
        'prepared_at' => 'prepared',
        'courier_started_at' => 'loading',
        'courier_signed_at' => 'signed',
        'in_transit_at' => 'in_transit',
        'delivered_at' => 'delivered',
        'received_at' => 'received',
    ];

    public function __construct(
        private readonly ShipmentWorkflowService $workflow,
        private readonly ShelfMatrix $shelves,
        private readonly StockLocationTree $tree,
        private readonly RefillBoard $board,
    ) {}

    /** The Main Store's id, or null; a viewer tied to another store gets null too. */
    private function mainStoreFor(User $viewer): ?int
    {
        $id = StockLocation::query()->where('kind', StockLocation::KIND_STORE)->where('name', self::MAIN_STORE)->value('store_id');

        if ($id === null || ($viewer->store_id !== null && (int) $viewer->store_id !== (int) $id)) {
            return null;
        }

        return (int) $id;
    }

    /**
     * The Main Store's refills alive between $from and $to: raised, accepted,
     * shelved (fulfilled); a Remote Hub refill also carries its transfer's
     * dispatch, hand-over and completion.
     *
     * @return array<int, array<string, mixed>>
     */
    public function refills(CarbonImmutable $from, CarbonImmutable $to, User $viewer): array
    {
        $storeId = $this->mainStoreFor($viewer);
        if ($storeId === null) {
            return [];
        }

        return RefillRequest::query()
            ->with(['item:id,product_name', 'transfer'])
            ->where('store_id', $storeId)
            ->where('created_at', '<=', $to)
            ->where(fn ($q) => $q->whereNull('fulfilled_at')->orWhere('fulfilled_at', '>=', $from))
            ->where(fn ($q) => $q->whereNull('cancelled_at')->orWhere('cancelled_at', '>=', $from))
            ->orderBy('created_at')
            ->limit(300)
            ->get()
            ->map(fn (RefillRequest $r): array => [
                'id' => (int) $r->id,
                'reference' => (string) $r->reference,
                'item_id' => (int) $r->item_id,
                'item' => $r->item?->product_name,
                'quantity' => (int) $r->quantity,
                'source' => (string) $r->source,
                'destination' => (string) ($r->destination ?? RefillRequest::DESTINATION_STORE),
                'status' => (string) $r->status,
                'raised_at' => $r->created_at?->toIso8601String(),
                'accepted_at' => $r->accepted_at?->toIso8601String(),
                'fulfilled_at' => $r->fulfilled_at?->toIso8601String(),
                'cancelled_at' => $r->cancelled_at?->toIso8601String(),
                'transfer' => $r->transfer === null ? null : [
                    'dispatched_at' => $r->transfer->dispatched_at?->toIso8601String(),
                    'handed_over_at' => $r->transfer->handed_over_at?->toIso8601String(),
                    'completed_at' => $r->transfer->completed_at?->toIso8601String(),
                    'cancelled_at' => $r->transfer->cancelled_at?->toIso8601String(),
                ],
            ])
            ->values()
            ->all();
    }

    /**
     * The Main Store's orders alive between $from and $to: the sale at the
     * counter, each payment's two ticks (claimed, then confirmed by someone
     * else), pick & pack, and the delivery from the store or the Remote Hub.
     *
     * @return array<int, array<string, mixed>>
     */
    public function orders(CarbonImmutable $from, CarbonImmutable $to, User $viewer): array
    {
        $storeId = $this->mainStoreFor($viewer);
        if ($storeId === null) {
            return [];
        }

        return Sale::query()
            ->with(['payments', 'delivery'])
            ->withCount('items')
            ->where('store_id', $storeId)
            ->where('created_at', '<=', $to)
            ->where(fn ($q) => $q
                ->whereNotIn('fulfillment_stage', [Sale::STAGE_DELIVERED, Sale::STAGE_CANCELLED])
                ->orWhere('updated_at', '>=', $from))
            ->orderBy('created_at')
            ->limit(300)
            ->get()
            ->map(fn (Sale $sale): array => $this->presentOrder($sale))
            ->values()
            ->all();
    }

    /**
     * Things that happened in the Main Store's places that are not a shipment,
     * a refill or an order, as ready-made events (no card of their own):
     * transfers a keeper raised by hand, and stocktakes.
     *
     * @return array<int, array<string, mixed>>
     */
    public function events(CarbonImmutable $from, CarbonImmutable $to, User $viewer): array
    {
        if ($this->mainStoreFor($viewer) === null) {
            return [];
        }

        return array_values(array_merge($this->transferEvents($from, $to), $this->countEvents($from, $to)));
    }

    /**
     * Transfers not tied to a refill (those replay as the refill): raised,
     * handed to the courier, handed over, received.
     *
     * @return array<int, array<string, mixed>>
     */
    private function transferEvents(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $refillTransfers = RefillRequest::query()->whereNotNull('transfer_id')->select('transfer_id');
        $mainStoreId = $this->mainStoreId();
        $out = [];

        Transfer::query()
            ->with(['itemVariant.item:id,product_name', 'initiator:id,first_name,last_name', 'courier:id,first_name,last_name'])
            ->whereNotIn('id', $refillTransfers)
            ->where('created_at', '<=', $to)
            ->where(fn ($q) => $q->whereNull('completed_at')->orWhere('completed_at', '>=', $from))
            ->where(fn ($q) => $q->whereNull('cancelled_at')->orWhere('cancelled_at', '>=', $from))
            ->orderBy('created_at')
            ->limit(300)
            ->get()
            ->each(function (Transfer $t) use (&$out, $mainStoreId): void {
                $origin = $this->transferPlace($t->source_location_type, $t->source_location_id, $mainStoreId);
                $destination = $this->transferPlace($t->destination_location_type, $t->destination_location_id, $mainStoreId);
                if ($origin === null && $destination === null) {
                    return;
                }

                $detail = $t->quantity.' × '.($t->itemVariant?->item?->product_name ?? 'item');
                $emit = function (string $step, mixed $at, string $what, ?string $where, string $who, array $extra = []) use (&$out, $t, $detail): void {
                    if ($at !== null) {
                        $out[] = ['key' => "transfer-{$t->id}-{$step}", 'at' => $at->toIso8601String(), 'kind' => 'transfer', 'subject' => (int) $t->id,
                            'reference' => (string) $t->reference, 'what' => $what, 'detail' => $detail, 'where' => $where, 'who' => $who] + $extra;
                    }
                };

                $emit('raised', $t->created_at, 'A transfer is raised'.($t->initiator ? ' by '.trim($t->initiator->first_name.' '.$t->initiator->last_name) : ''), $origin, 'stock_keeper');
                $emit('dispatched', $t->dispatched_at, $t->courier_id !== null ? 'Handed to the courier' : 'Sent', $origin, 'stock_keeper');
                $emit('handed', $t->handed_over_at, 'The courier hands it over', $destination, 'delivery');
                $emit('completed', $t->completed_at, 'Received: it lands', $destination, 'stock_keeper', ['final' => true]);
                $emit('cancelled', $t->cancelled_at, 'Transfer cancelled', $origin, 'stock_keeper', ['final' => true, 'bad' => true]);
            });

        return $out;
    }

    /**
     * Stocktakes of the Main Store's places: submitted, then posted (adjustments
     * booked by someone else) or voided.
     *
     * @return array<int, array<string, mixed>>
     */
    private function countEvents(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $mainStoreId = $this->mainStoreId();
        $out = [];

        Stocktake::query()
            ->with('location')
            ->withCount('lines')
            ->where('created_at', '<=', $to)
            ->where(fn ($q) => $q->whereNull('posted_at')->orWhere('posted_at', '>=', $from))
            ->where(fn ($q) => $q->whereNull('voided_at')->orWhere('voided_at', '>=', $from))
            ->orderBy('created_at')
            ->limit(300)
            ->get()
            ->each(function (Stocktake $s) use (&$out, $mainStoreId): void {
                $where = $this->placeKey($s->location, $mainStoreId);
                if ($where === null) {
                    return;
                }

                $detail = ($s->location?->name ?? 'A place').' · '.$s->lines_count.' '.($s->lines_count === 1 ? 'line' : 'lines');
                $emit = function (string $step, mixed $at, string $what, string $who, array $extra = []) use (&$out, $s, $where, $detail): void {
                    if ($at !== null) {
                        $out[] = ['key' => "count-{$s->id}-{$step}", 'at' => $at->toIso8601String(), 'kind' => 'count', 'subject' => (int) $s->id,
                            'reference' => (string) $s->reference, 'what' => $what, 'detail' => $detail, 'where' => $where, 'who' => $who] + $extra;
                    }
                };

                $emit('started', $s->created_at, 'A count starts', 'stock_keeper');
                $emit('submitted', $s->submitted_at, 'The count is submitted for approval', 'stock_keeper');
                $emit('posted', $s->posted_at, 'Approved by a second person: adjustments booked', 'store_manager', ['final' => true]);
                $emit('voided', $s->voided_at, 'The count is voided', 'store_manager', ['final' => true, 'bad' => true]);
            });

        return $out;
    }

    private function mainStoreId(): ?int
    {
        $id = StockLocation::query()->where('kind', StockLocation::KIND_STORE)->where('name', self::MAIN_STORE)->value('store_id');

        return $id === null ? null : (int) $id;
    }

    /** The world place a transfer endpoint (legacy morph or location id) stands for. */
    private function transferPlace(?string $type, ?int $id, ?int $mainStoreId): ?string
    {
        if ($type === null || $id === null) {
            return null;
        }

        $leaf = $this->tree->leafIdFor($type, $id);

        return $leaf === null ? null : $this->placeKey(StockLocation::query()->find($leaf), $mainStoreId);
    }

    /** @return array<string, mixed> */
    private function presentOrder(Sale $sale): array
    {
        $delivery = $sale->delivery;
        $source = null;
        if ($delivery?->source_location_type !== null && $delivery->source_location_id !== null) {
            $leaf = $this->tree->leafIdFor((string) $delivery->source_location_type, (int) $delivery->source_location_id);
            $source = $leaf === null ? null : $this->placeKey(StockLocation::query()->find($leaf), (int) $sale->store_id);
        }

        return [
            'id' => (int) $sale->id,
            'reference' => (string) $sale->reference_number,
            'stage' => (string) $sale->fulfillment_stage,
            'total' => (float) $sale->total_amount,
            'items' => (int) ($sale->items_count ?? 0),
            'created_at' => $sale->created_at?->toIso8601String(),
            'payments' => $sale->payments
                ->where('kind', '!=', Payment::KIND_REPAYMENT)
                ->map(fn (Payment $p): array => [
                    'method' => (string) $p->payment_method,
                    'status' => (string) $p->status,
                    'amount' => (float) $p->amount,
                    'claimed_at' => ($p->claimed_at ?? $p->paid_at ?? $p->created_at)?->toIso8601String(),
                    'confirmed_at' => $p->confirmed_at?->toIso8601String(),
                ])
                ->values()
                ->all(),
            'picking_started_at' => $sale->picking_started_at?->toIso8601String(),
            'packed_at' => $sale->packed_at?->toIso8601String(),
            'cancelled_at' => $sale->fulfillment_stage === Sale::STAGE_CANCELLED ? $sale->updated_at?->toIso8601String() : null,
            'delivery' => $delivery === null ? null : [
                'method' => (string) $delivery->method,
                'source' => $source ?? 'store_floor',
                'picked_up_at' => $delivery->picked_up_at?->toIso8601String(),
                'shipped_at' => $delivery->shipped_at?->toIso8601String(),
                'delivered_at' => $delivery->delivered_at?->toIso8601String(),
                'failed_at' => $delivery->failed_at?->toIso8601String(),
            ],
        ];
    }

    /**
     * Every shipment alive at any moment between $from and $to.
     *
     * @return array{shipments: array<int, array<string, mixed>>, days: array<int, string>}
     */
    public function between(CarbonImmutable $from, CarbonImmutable $to, User $viewer): array
    {
        $query = Shipment::query()
            ->with(['originLocation', 'destinationLocation', 'courier:id,first_name,last_name', 'creator:id,first_name,last_name'])
            ->withCount('items')
            ->withSum('items', 'cbm')
            ->where('created_at', '<=', $to)
            ->where(fn ($q) => $q->whereNull('received_at')->orWhere('received_at', '>=', $from))
            ->where(fn ($q) => $q->whereNull('cancelled_at')->orWhere('cancelled_at', '>=', $from))
            ->orderBy('created_at');

        if ($viewer->store_id !== null) {
            $query->forStore((int) $viewer->store_id);
        }

        $mainStoreId = StockLocation::query()->where('kind', StockLocation::KIND_STORE)->where('name', self::MAIN_STORE)->value('store_id');

        $shipments = $query->get()->map(fn (Shipment $s): array => $this->present($s, $mainStoreId === null ? null : (int) $mainStoreId));

        return ['shipments' => $shipments->values()->all(), 'days' => $this->busyDays($viewer)];
    }

    /**
     * What the Guide's Play mode can pick up and carry (`?play=1`), as it
     * stands now. Main Store only, as the rest of the world; a viewer tied to
     * another store gets nothing (store null), and plays Watch only.
     *
     * Store Floor → Store Shelf: the floor → shelf transfers waiting on the
     * stock keeper's shelving list (RefillBoard), each with its unit and the
     * size of one in m³ (null when the variant has none recorded); the bins
     * at or below their refill line with nothing on its way; and whether this
     * viewer may shelve for real.
     *
     * Hub → Freight Car: the shipments the freight car loads (loads()).
     *
     * Remote Hub → Store: what waits to go from the Remote Hub to the store
     * floor by courier (remoteJobs()); never for a seller.
     *
     * A read only: Play writes through the normal routes.
     *
     * @return array{store: array{id: int, name: string}|null, shelf: array{id: int, name: string}|null, to_shelve: array<int, array<string, mixed>>, needs: array<int, array<string, mixed>>, can_shelve: bool, loads: array<int, array<string, mixed>>, remote: array<int, array<string, mixed>>}
     */
    public function play(User $viewer, string $app = ''): array
    {
        $storeId = $this->mainStoreFor($viewer);

        if ($storeId === null) {
            return ['store' => null, 'shelf' => null, 'to_shelve' => [], 'needs' => [], 'can_shelve' => false, 'loads' => [], 'remote' => [], 'runs' => [], 'legs' => [], 'stations' => []];
        }

        $list = $this->board->shelvingList($storeId, $viewer);
        $sizes = $this->unitSizes(array_map(fn (array $row): int => (int) $row['transfer_id'], $list['to_shelve']));

        return [
            'store' => ['id' => $storeId, 'name' => self::MAIN_STORE],
            'shelf' => $list['shelf'],
            'to_shelve' => array_map(fn (array $row): array => $row + ($sizes[(int) $row['transfer_id']] ?? ['unit' => 'Unit', 'unit_cbm' => null]), $list['to_shelve']),
            'needs' => $list['needs'],
            'can_shelve' => (bool) $list['can_shelve'],
            'loads' => $this->loads($storeId, $viewer),
            'remote' => $this->remoteJobs($storeId, $viewer, $list['to_accept']),
            'runs' => $this->runs($storeId, $viewer),
            'legs' => $this->legs($storeId, $viewer, $list['to_accept']),
            'stations' => app(StationFeed::class)->for($viewer, $app, $storeId, $list),
        ];
    }

    /**
     * Transfer legs touching the world's places: refill legs to accept, and
     * transfers that are pending or on the road between two of them (a hub and
     * the store, the Remote Hub and the floor). Moves inside the store (floor
     * to shelf) are the shelving job, so they are left out. Each says where it
     * stands (`stage`) and the steps this viewer can take now, with the same
     * checks the routes make: claim (a courier), dispatch (the origin's people,
     * not while an automated proposal awaits approval), handover (the courier
     * carrying it), complete (the destination's people), cancel.
     *
     * @param  array<int, array<string, mixed>>  $toAccept  RefillBoard::shelvingList()['to_accept']
     * @return array<int, array<string, mixed>>
     */
    private function legs(int $storeId, User $viewer, array $toAccept): array
    {
        // Sellers may see the Remote Hub only as stocked or not, never what moves from it.
        if ($viewer->roleKey() === 'seller') {
            return [];
        }

        $workflow = app(TransferWorkflowService::class);

        $transfers = Transfer::query()
            ->whereIn('status', [TransferWorkflowService::STATUS_PENDING, TransferWorkflowService::STATUS_IN_TRANSIT])
            ->where('source_location_type', StockLocation::class)
            ->where('destination_location_type', StockLocation::class)
            ->with(['itemVariant.item:id,product_name', 'itemVariant.itemPackagingType:id,name', 'itemVariant.packagingQuantities', 'courier:id,first_name,last_name'])
            ->orderBy('id')
            ->limit(40)
            ->get();

        $places = StockLocation::query()
            ->whereIn('id', $transfers->pluck('source_location_id')->merge($transfers->pluck('destination_location_id'))->unique()->all())
            ->get()
            ->keyBy('id');

        $legs = $transfers
            ->filter(function (Transfer $t) use ($places, $storeId): bool {
                $from = $this->placeKey($places->get((int) $t->source_location_id), $storeId);
                $to = $this->placeKey($places->get((int) $t->destination_location_id), $storeId);

                return $from !== null && $to !== null && ! ($from === 'store_floor' && $to === 'store_floor');
            })
            ->map(function (Transfer $t) use ($places, $storeId, $viewer, $workflow): array {
                $origin = $places->get((int) $t->source_location_id);
                $destination = $places->get((int) $t->destination_location_id);
                $needsCourier = $workflow->needsCourier($t);
                $pending = $t->status === TransferWorkflowService::STATUS_PENDING;
                $mineToCarry = $t->courier_id !== null && (int) $t->courier_id === (int) $viewer->id;
                $atOrigin = $origin->canBeOperatedBy($viewer);
                $atDestination = $destination->canBeOperatedBy($viewer);

                $steps = array_keys(array_filter([
                    'claim' => $pending && $needsCourier && $t->courier_id === null && $viewer->roleKey() === 'delivery',
                    'dispatch' => $pending && ! $t->awaitsApproval() && ($t->courier_id !== null || ! $needsCourier) && $atOrigin,
                    'handover' => ! $pending && $needsCourier && $mineToCarry && $t->handed_over_at === null,
                    'complete' => ! $pending && $atDestination,
                    'cancel' => $atOrigin || $atDestination,
                ]));

                return [
                    'key' => 'transfer-'.$t->id,
                    'kind' => 'transfer',
                    'id' => (int) $t->id,
                    'reference' => (string) $t->reference,
                    'stage' => $pending ? ($t->courier_id !== null ? 'claimed' : 'waiting') : ($t->handed_over_at !== null ? 'handed_over' : 'in_transit'),
                    'origin' => $this->placeKey($origin, $storeId),
                    'destination' => $this->placeKey($destination, $storeId),
                    'item_name' => (string) ($t->itemVariant?->item?->product_name ?? 'Unknown item'),
                    'quantity' => (int) $t->quantity,
                    'unit' => (string) ($t->itemVariant?->itemPackagingType?->name ?? 'Unit'),
                    'unit_cbm' => $this->ownUnitCbm($t->itemVariant),
                    'needs_courier' => $needsCourier,
                    'courier' => $t->courier ? trim($t->courier->first_name.' '.$t->courier->last_name) : null,
                    'awaits_approval' => $t->awaitsApproval(),
                    'steps' => $steps,
                ];
            })
            ->values()
            ->all();

        $refills = RefillRequest::query()
            ->whereIn('id', array_map(fn (array $leg): int => (int) $leg['id'], $toAccept))
            ->with('itemVariant.packagingQuantities')
            ->get()
            ->keyBy('id');

        $accept = array_map(fn (array $leg): array => [
            'key' => 'leg-'.$leg['id'],
            'kind' => 'refill',
            'id' => (int) $leg['id'],
            'reference' => (string) $leg['reference'],
            'stage' => 'to_accept',
            'origin' => 'remote_hub',
            'destination' => 'store_floor',
            'item_name' => (string) $leg['item_name'],
            'quantity' => (int) $leg['quantity'],
            'unit' => (string) $leg['unit'],
            'unit_cbm' => $this->ownUnitCbm($refills->get((int) $leg['id'])?->itemVariant),
            'needs_courier' => true,
            'courier' => null,
            'awaits_approval' => false,
            'steps' => $refills->get((int) $leg['id']) !== null && $viewer->can('accept', $refills->get((int) $leg['id'])) ? ['accept'] : [],
        ], $toAccept);

        return [...$accept, ...$legs];
    }

    /**
     * The shipments after picking: prepared, on the road, or arrived and not
     * yet signed in. The hand-off steps that follow Mark prepared: the courier
     * starts, checks the load, signs and arrives; the receiving dock checks
     * the goods, counts them and signs. `steps` are the ones this viewer can
     * take now (ShipmentHandoffService::stepsFor, the check the step route
     * makes); a count already saved is shown on its line.
     *
     * @return array<int, array<string, mixed>>
     */
    private function runs(int $storeId, User $viewer): array
    {
        $handoff = app(ShipmentHandoffService::class);

        return Shipment::query()
            ->forStore($storeId)
            ->whereIn('status', [ShipmentWorkflowService::READY, ShipmentWorkflowService::DISPATCHED, ShipmentWorkflowService::IN_TRANSIT, ShipmentWorkflowService::DELIVERED])
            ->with([
                'originLocation', 'destinationLocation', 'courier:id,first_name,last_name',
                'items.itemVariant.item:id,product_name', 'items.itemVariant.itemPackagingType:id,name', 'items.itemVariant.packagingQuantities',
            ])
            ->orderByRaw('coalesce(agreed_scheduled_for, scheduled_for, created_at)')
            ->orderBy('id')
            ->limit(10)
            ->get()
            ->filter(fn (Shipment $s): bool => $this->placeKey($s->originLocation, $storeId) !== null && $this->placeKey($s->destinationLocation, $storeId) !== null)
            ->map(fn (Shipment $s): array => [
                'id' => (int) $s->id,
                'reference' => (string) $s->reference,
                'status' => (string) $s->status,
                'stage' => $handoff->stage($s),
                'origin' => $this->placeKey($s->originLocation, $storeId),
                'destination' => $this->placeKey($s->destinationLocation, $storeId),
                'courier' => $s->courier ? trim($s->courier->first_name.' '.$s->courier->last_name) : null,
                'steps' => $handoff->stepsFor($s, $viewer),
                'lines' => $s->items->map(fn (ShipmentItem $line): array => [
                    'variant_id' => (int) $line->item_variant_id,
                    'name' => (string) ($line->itemVariant?->item?->product_name ?? 'Unknown product'),
                    'unit' => (string) ($line->unit ?: ($line->itemVariant?->itemPackagingType?->name ?? 'Unit')),
                    'quantity' => (int) $line->quantity,
                    'received' => $line->received_quantity !== null ? (int) $line->received_quantity : null,
                    'damaged' => $line->damaged_quantity !== null ? (int) $line->damaged_quantity : null,
                ])->values()->all(),
            ])
            ->values()
            ->all();
    }

    /**
     * What waits to go from the Main Store's Remote Hub to its floor. It
     * leaves the site, so a courier carries it (custody: In Delivery):
     *
     *   to_accept  a refill leg on the Remote Hub list, for the hub to accept
     *              (the shelving list's to_accept; no transfer yet)
     *   pending    a Remote Hub → floor transfer not yet handed to a courier
     *
     * Each with its unit and the size of one. Sellers get none: they may see
     * the Remote Hub only as "stocked" or not, never quantities.
     *
     * @param  array<int, array<string, mixed>>  $toAccept  RefillBoard::shelvingList()['to_accept']
     * @return array<int, array<string, mixed>>
     */
    private function remoteJobs(int $storeId, User $viewer, array $toAccept): array
    {
        if ($viewer->roleKey() === 'seller') {
            return [];
        }

        $hub = StockLocation::query()->where('store_id', $storeId)->where('kind', StockLocation::KIND_REMOTE_HUB)->first();
        $floor = StockLocation::query()->where('store_id', $storeId)->where('kind', StockLocation::KIND_BACKROOM)->first();
        if ($hub === null || $floor === null) {
            return [];
        }

        $legVariants = RefillRequest::query()
            ->whereIn('id', array_map(fn (array $leg): int => (int) $leg['id'], $toAccept))
            ->with('itemVariant.packagingQuantities')
            ->get()
            ->keyBy('id');
        $legs = array_map(fn (array $leg): array => [
            'key' => 'leg-'.$leg['id'],
            'reference' => (string) $leg['reference'],
            'stage' => 'to_accept',
            'item_name' => (string) $leg['item_name'],
            'quantity' => (int) $leg['quantity'],
            'unit' => (string) $leg['unit'],
            'unit_cbm' => $this->ownUnitCbm($legVariants->get((int) $leg['id'])?->itemVariant),
            'urgent' => (bool) $leg['urgent'],
        ], $toAccept);

        $transfers = Transfer::query()
            ->where('source_location_type', StockLocation::class)
            ->where('source_location_id', $hub->id)
            ->where('destination_location_type', StockLocation::class)
            ->where('destination_location_id', $floor->id)
            ->where('status', TransferWorkflowService::STATUS_PENDING)
            ->where('approval_state', '!=', Transfer::APPROVAL_PENDING)
            ->with(['itemVariant.item:id,product_name', 'itemVariant.itemPackagingType:id,name', 'itemVariant.packagingQuantities'])
            ->orderBy('id')
            ->get()
            ->map(fn (Transfer $t): array => [
                'key' => 'transfer-'.$t->id,
                'reference' => (string) $t->reference,
                'stage' => 'pending',
                'item_name' => (string) ($t->itemVariant?->item?->product_name ?? 'Unknown item'),
                'quantity' => (int) $t->quantity,
                'unit' => (string) ($t->itemVariant?->itemPackagingType?->name ?? 'Unit'),
                'unit_cbm' => $this->ownUnitCbm($t->itemVariant),
                'urgent' => false,
            ])
            ->all();

        return [...$legs, ...$transfers];
    }

    /**
     * The freight car's jobs: shipments from Main Hub A or B to the Main
     * Store (its floor or its Remote Hub) that are scheduled or being picked,
     * soonest first. Loading the car is the stock keeper's pick, so each line
     * says what is already picked, and where in its hub the item sits (the
     * first floor area it is placed in, when the hub has a floor plan).
     *
     * Each line's sizes: `line_cbm` as the manifest recorded it (the whole
     * line; often empty) and `unit_cbm`, one unit of the variant's own
     * packaging; either may be null. The vehicle's `max_cbm` is the copy the
     * shipment keeps, else the car's own. `can_pick`: may this viewer pick it
     * for real (the same check the step route makes: someone who works the
     * origin hub's dock, ShipmentHandoffService::mayAct).
     *
     * @return array<int, array<string, mixed>>
     */
    private function loads(int $storeId, User $viewer): array
    {
        $shipments = Shipment::query()
            ->forStore($storeId)
            ->whereIn('status', [ShipmentWorkflowService::SCHEDULED, ShipmentWorkflowService::PICKING])
            ->with([
                'originLocation', 'destinationLocation', 'vehicle:id,name,plate,max_cbm,payload_kg',
                'items.itemVariant.item:id,product_name', 'items.itemVariant.itemPackagingType:id,name', 'items.itemVariant.packagingQuantities',
            ])
            ->orderByRaw('coalesce(agreed_scheduled_for, scheduled_for, created_at)')
            ->orderBy('id')
            ->limit(10)
            ->get()
            ->filter(fn (Shipment $s): bool => $s->originLocation?->kind === StockLocation::KIND_MAIN_HUB
                && $this->placeKey($s->originLocation, $storeId) !== null
                && $this->placeKey($s->destinationLocation, $storeId) !== null);

        // Where each item sits in each origin hub: area codes, by location then item.
        $areas = [];
        FloorArea::query()
            ->whereIn('stock_location_id', $shipments->pluck('origin_stock_location_id')->unique()->all())
            ->with('items:id')
            ->orderBy('code')
            ->get()
            ->each(function (FloorArea $area) use (&$areas): void {
                foreach ($area->items as $item) {
                    $areas[(int) $area->stock_location_id][(int) $item->id] ??= (string) $area->code;
                }
            });

        $handoff = app(ShipmentHandoffService::class);

        return $shipments->map(fn (Shipment $s): array => $this->presentLoad($s, $storeId, $areas) + [
            'can_pick' => $handoff->mayAct($s, ShipmentHandoffService::PICK_LINE, $viewer),
        ])->values()->all();
    }

    /**
     * @param  array<int, array<int, string>>  $areas  area codes by origin location, then item
     * @return array<string, mixed>
     */
    private function presentLoad(Shipment $s, int $storeId, array $areas): array
    {
        $maxCbm = (float) ($s->vehicle_max_cbm ?? $s->vehicle?->max_cbm ?? 0);

        return [
            'id' => (int) $s->id,
            'reference' => (string) $s->reference,
            'status' => (string) $s->status,
            'origin' => $this->placeKey($s->originLocation, $storeId),
            'destination' => $this->placeKey($s->destinationLocation, $storeId),
            'scheduled_for' => ($s->agreed_scheduled_for ?? $s->scheduled_for)?->toIso8601String(),
            'vehicle' => [
                'name' => $s->vehicle?->name ?? $s->vehicle_name,
                'plate' => $s->vehicle?->plate ?? $s->vehicle_plate,
                'max_cbm' => $maxCbm > 0 ? $maxCbm : null,
                'payload_kg' => $s->vehicle?->payload_kg,
            ],
            'lines' => $s->items->map(function (ShipmentItem $line) use ($s, $areas): array {
                $variant = $line->itemVariant;

                return [
                    'variant_id' => (int) $line->item_variant_id,
                    'name' => (string) ($variant?->item?->product_name ?? 'Unknown product'),
                    'unit' => (string) ($line->unit ?: ($variant?->itemPackagingType?->name ?? 'Unit')),
                    'quantity' => (int) $line->quantity,
                    'picked_quantity' => (int) $line->picked_quantity,
                    'line_cbm' => $line->cbm !== null && (float) $line->cbm > 0 ? (float) $line->cbm : null,
                    'unit_cbm' => $this->ownUnitCbm($variant),
                    'weight_kg' => $line->weight_kg !== null ? (float) $line->weight_kg : null,
                    'area' => $variant !== null ? ($areas[(int) $s->origin_stock_location_id][(int) $variant->item_id] ?? null) : null,
                ];
            })->values()->all(),
        ];
    }

    /** The size of one unit of the variant's own packaging, in m³ (item_variant_packaging_quantity), or null when none is recorded. */
    private function ownUnitCbm(?ItemVariant $variant): ?float
    {
        $own = $variant?->packagingQuantities->firstWhere('id', $variant->item_packaging_type_id);
        $cbm = $own?->pivot?->cbm;

        return $cbm !== null && (float) $cbm > 0 ? (float) $cbm : null;
    }

    /**
     * Each transfer's unit (its variant's own packaging: a transfer's quantity
     * is counted in it) and the size of one, from item_variant_packaging_quantity.
     *
     * @param  array<int, int>  $transferIds
     * @return array<int, array{unit: string, unit_cbm: float|null}>
     */
    private function unitSizes(array $transferIds): array
    {
        if ($transferIds === []) {
            return [];
        }

        return Transfer::query()
            ->whereIn('id', $transferIds)
            ->with(['itemVariant.itemPackagingType:id,name', 'itemVariant.packagingQuantities'])
            ->get(['id', 'item_variant_id'])
            ->mapWithKeys(function (Transfer $transfer): array {
                $variant = $transfer->itemVariant;

                return [(int) $transfer->id => [
                    'unit' => (string) ($variant?->itemPackagingType?->name ?? 'Unit'),
                    'unit_cbm' => $this->ownUnitCbm($variant),
                ]];
            })
            ->all();
    }

    /**
     * The Main Store's shelf as it stands now, bin by bin in layout order:
     * the n-th bin is tier ⌈n/50⌉, coordinate A–E across × 1–10 down, as
     * ShelfMatrix numbers them. Empty for a viewer tied to another store.
     *
     * @return array<int, array<string, mixed>>
     */
    public function shelf(User $viewer): array
    {
        $shelf = StockLocation::query()
            ->where('kind', StockLocation::KIND_SHELF)
            ->whereIn('store_id', StockLocation::query()->where('kind', StockLocation::KIND_STORE)->where('name', self::MAIN_STORE)->select('store_id'))
            ->first();

        if ($shelf === null || ($viewer->store_id !== null && (int) $viewer->store_id !== (int) $shelf->store_id)) {
            return [];
        }

        return $this->shelves->bins($shelf)
            ->map(fn (array $bin): array => [
                'item_id' => $bin['item_id'],
                'name' => $bin['name'],
                'display' => $bin['display'],
                'fill' => $bin['fill'],
                'status' => $bin['status'],
                'assigned' => $bin['assigned'],
                'band' => $bin['band'] === null ? null : [
                    'max' => $bin['band']['max'], 'refill' => $bin['band']['refill'], 'critical' => $bin['band']['critical'], 'unit' => $bin['unit']['name'],
                ],
            ])
            ->values()
            ->all();
    }

    /** @return array<string, mixed> */
    private function present(Shipment $shipment, ?int $mainStoreId): array
    {
        $steps = [];
        foreach (self::STEPS as $column => $key) {
            $steps[$key] = $shipment->{$column}?->toIso8601String();
        }

        $parties = [];
        foreach ($this->workflow->agreements($shipment) as $party => $row) {
            $parties[] = ['party' => $party, 'status' => $row['status'], 'at' => $row['at']];
        }

        return [
            'id' => (int) $shipment->id,
            'reference' => (string) $shipment->reference,
            'status' => (string) $shipment->status,
            'origin' => ['place' => $this->placeKey($shipment->originLocation, $mainStoreId), 'name' => $shipment->originLocation?->name],
            'destination' => ['place' => $this->placeKey($shipment->destinationLocation, $mainStoreId), 'name' => $shipment->destinationLocation?->name],
            'vehicle' => trim(($shipment->vehicle_name ?? '').' '.($shipment->vehicle_plate ?? '')) ?: null,
            'courier' => $shipment->courier ? trim($shipment->courier->first_name.' '.$shipment->courier->last_name) : null,
            'creator' => $shipment->creator ? trim($shipment->creator->first_name.' '.$shipment->creator->last_name) : null,
            'items' => (int) ($shipment->items_count ?? 0),
            'cbm' => round((float) ($shipment->items_sum_cbm ?? 0), 2),
            'created_at' => $shipment->created_at?->toIso8601String(),
            'scheduled_for' => ($shipment->agreed_scheduled_for ?? $shipment->scheduled_for)?->toIso8601String(),
            'eta' => $shipment->eta?->toIso8601String(),
            'cancelled_at' => $shipment->cancelled_at?->toIso8601String(),
            'parties' => $parties,
            'steps' => $steps,
        ];
    }

    private function placeKey(?StockLocation $location, ?int $mainStoreId): ?string
    {
        if ($location === null) {
            return null;
        }

        if ($location->kind === StockLocation::KIND_MAIN_HUB) {
            return match (true) {
                (bool) preg_match('/\bA$/', trim((string) $location->name)) => 'main_hub_a',
                (bool) preg_match('/\bB$/', trim((string) $location->name)) => 'main_hub_b',
                default => null,
            };
        }

        if ($mainStoreId === null || (int) $location->store_id !== $mainStoreId) {
            return null;
        }

        return match ($location->kind) {
            StockLocation::KIND_REMOTE_HUB => 'remote_hub',
            StockLocation::KIND_BACKROOM, StockLocation::KIND_SHELF, StockLocation::KIND_STORE => 'store_floor',
            default => null,
        };
    }

    /**
     * Days in the last 90 with something happening (a shipment step, or the
     * Main Store's orders and refills), for the calendar's dots and the
     * timeline's jumps between busy days.
     *
     * @return array<int, string> Y-m-d
     */
    private function busyDays(User $viewer): array
    {
        $since = CarbonImmutable::now()->subDays(90)->startOfDay();
        $columns = ['created_at', ...array_keys(self::STEPS)];

        $query = Shipment::query()->where('created_at', '>=', $since->subDays(30));
        if ($viewer->store_id !== null) {
            $query->forStore((int) $viewer->store_id);
        }

        /** @var Collection<int, Shipment> $rows */
        $rows = $query->get(['id', ...$columns]);
        $moments = $rows->flatMap(fn (Shipment $s) => collect($columns)->map(fn (string $c) => $s->{$c}));

        $storeId = $this->mainStoreFor($viewer);
        if ($storeId !== null) {
            $refillColumns = ['created_at', 'accepted_at', 'fulfilled_at'];
            $moments = $moments->merge(
                RefillRequest::query()->where('store_id', $storeId)->where('created_at', '>=', $since->subDays(30))->get(['id', ...$refillColumns])
                    ->flatMap(fn (RefillRequest $r) => collect($refillColumns)->map(fn (string $c) => $r->{$c})),
            );
            $saleColumns = ['created_at', 'picking_started_at', 'packed_at'];
            $moments = $moments->merge(
                Sale::query()->where('store_id', $storeId)->where('created_at', '>=', $since->subDays(30))->get(['id', ...$saleColumns])
                    ->flatMap(fn (Sale $sale) => collect($saleColumns)->map(fn (string $c) => $sale->{$c})),
            );
        }

        return $moments
            ->filter(fn ($at) => $at !== null && $at >= $since)
            ->map(fn ($at) => $at->toDateString())
            ->unique()
            ->sort()
            ->values()
            ->all();
    }
}
