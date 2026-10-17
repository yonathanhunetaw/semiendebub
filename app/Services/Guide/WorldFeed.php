<?php

declare(strict_types=1);

namespace App\Services\Guide;

use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\Sale;
use App\Models\Inventory\RefillRequest;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Stocktake;
use App\Models\StockKeeper\Transfer;
use App\Services\Inventory\ShelfMatrix;
use App\Services\Inventory\StockLocationTree;
use App\Services\ShipmentWorkflowService;
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
    ) {
    }

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
