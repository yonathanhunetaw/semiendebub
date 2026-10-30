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
use App\Models\Procurement\Consignment;
use App\Models\StockKeeper\Transfer;
use App\Models\Workforce\KeyHandover;
use App\Models\Workforce\LeaveRequest;
use App\Models\Workforce\ShiftSwap;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\StaffRide;
use App\Models\Workforce\TimeEntry;
use App\Services\Fulfillment\ShipmentHandoffService;
use App\Models\Inventory\ItemStock;
use App\Services\Inventory\PackagingLadder;
use App\Services\Inventory\RefillBoard;
use App\Services\Inventory\ShelfMatrix;
use App\Services\Inventory\StockPermissions;
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

    /** What the world's 40 ft container (places.ts CONTAINER) holds, in m³: 12.03 × 2.35 × 2.39 m inside. */
    public const CONTAINER_CBM = 67.0;

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
        private readonly PackagingLadder $ladder,
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
            ->with(['item:id,product_name', 'transfer', 'raiser:id,first_name', 'accepter:id,first_name', 'canceller:id,first_name'])
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
                'raised_by' => $r->raiser?->first_name,
                'accepted_by' => $r->accepter?->first_name,
                'cancelled_by' => $r->canceller?->first_name,
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
            ->with(['payments.claimer:id,first_name', 'payments.confirmer:id,first_name', 'delivery.courier:id,first_name', 'seller:id,first_name', 'pickingStartedBy:id,first_name'])
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

        return array_values(array_merge($this->transferEvents($from, $to), $this->countEvents($from, $to), $this->workEvents($from, $to, $viewer)));
    }

    /**
     * The Work area as events: a site opened (late, without the key) or closed or missed, people clocking in and
     * out, shift swaps, key hand-overs, leave and staff rides. Staff names are first names; a store-tied viewer
     * only sees people of their own store.
     *
     * @return array<int, array<string, mixed>>
     */
    private function workEvents(CarbonImmutable $from, CarbonImmutable $to, User $viewer): array
    {
        $mainStoreId = $this->mainStoreId();
        $out = [];
        $mine = fn (?User $u): bool => $viewer->store_id === null || $u === null || $u->store_id === null || (int) $u->store_id === (int) $viewer->store_id;
        $inRange = fn (mixed $at): bool => $at !== null && $at >= $from && $at <= $to;
        $emit = function (string $key, mixed $at, string $subject, string $reference, string $what, string $detail, ?string $where, string $who, array $extra = []) use (&$out, $inRange): void {
            if ($inRange($at)) {
                $out[] = ['key' => $key, 'at' => $at->toIso8601String(), 'kind' => 'work', 'subject' => (int) crc32($subject) & 0x7fffffff,
                    'reference' => $reference, 'what' => $what, 'detail' => $detail, 'where' => $where, 'who' => $who] + $extra;
            }
        };
        $name = fn (?User $u, string $fallback): string => $u?->first_name ?: $fallback;

        // Sites: opened, closed, missed.
        SiteDay::query()
            ->with(['site', 'opener:id,first_name,store_id', 'closer:id,first_name,store_id', 'openedBy:id,first_name,store_id', 'closedBy:id,first_name,store_id'])
            ->where(fn ($q) => $q->whereBetween('opened_at', [$from, $to])->orWhereBetween('closed_at', [$from, $to])->orWhereBetween('missed_at', [$from, $to]))
            ->orderBy('date')
            ->limit(300)
            ->get()
            ->each(function (SiteDay $d) use ($emit, $name, $mine, $mainStoreId): void {
                $where = $this->placeKey($d->site, $mainStoreId) ?? 'office';
                $site = (string) ($d->site?->name ?? 'a site');
                $ref = 'Site · '.$d->date?->format('Y-m-d');
                $opener = $d->openedBy ?? $d->opener;
                $closer = $d->closedBy ?? $d->closer;
                if (! $mine($opener) && ! $mine($closer)) {
                    return;
                }
                $emit("site-{$d->id}-opened", $d->opened_at, "site-{$d->id}", $ref, $name($opener, 'Someone').' opens '.$site.($d->opened_without_key ? ' without the key' : ''), $site, $where, 'store_manager');
                $emit("site-{$d->id}-closed", $d->closed_at, "site-{$d->id}", $ref, $name($closer, 'Someone').' closes '.$site, $site, $where, 'store_manager', ['final' => true]);
                $emit("site-{$d->id}-missed", $d->missed_at, "site-{$d->id}", $ref, $site.' was not opened on time', $site, $where, 'store_manager', ['final' => true, 'bad' => true]);
            });

        // Clocking in and out.
        TimeEntry::query()
            ->with(['user:id,first_name,store_id', 'site'])
            ->where(fn ($q) => $q->whereBetween('clock_in_at', [$from, $to])->orWhereBetween('clock_out_at', [$from, $to]))
            ->orderBy('clock_in_at')
            ->limit(300)
            ->get()
            ->each(function (TimeEntry $t) use ($emit, $name, $mine, $mainStoreId): void {
                if (! $mine($t->user)) {
                    return;
                }
                $where = $this->placeKey($t->site, $mainStoreId) ?? 'office';
                $site = (string) ($t->site?->name ?? 'work');
                $who = $name($t->user, 'Someone');
                $emit("clock-{$t->id}-in", $t->clock_in_at, "clock-{$t->id}", 'Clock-in', $who.' clocks in', $site, $where, 'seller');
                $emit("clock-{$t->id}-out", $t->clock_out_at, "clock-{$t->id}", 'Clock-in', $who.' clocks out', $site, $where, 'seller', ['final' => true]);
            });

        // Shift swaps.
        ShiftSwap::query()
            ->with(['from:id,first_name,store_id', 'to:id,first_name,store_id', 'shift.site'])
            ->where(fn ($q) => $q->whereBetween('created_at', [$from, $to])->orWhereBetween('taken_at', [$from, $to])->orWhereBetween('decided_at', [$from, $to]))
            ->orderBy('created_at')
            ->limit(200)
            ->get()
            ->each(function (ShiftSwap $w) use ($emit, $name, $mine): void {
                if (! $mine($w->from)) {
                    return;
                }
                $detail = (string) ($w->shift?->site?->name ?? 'a shift');
                $ref = 'Swap #'.$w->id;
                $emit("swap-{$w->id}-offered", $w->created_at, "swap-{$w->id}", $ref, $name($w->from, 'Someone').' offers a shift', $detail, 'office', 'seller');
                $emit("swap-{$w->id}-taken", $w->taken_at, "swap-{$w->id}", $ref, $name($w->to, 'Someone').' takes the shift', $detail, 'office', 'seller');
                $approved = $w->status === ShiftSwap::STATUS_APPROVED;
                if (in_array($w->status, [ShiftSwap::STATUS_APPROVED, ShiftSwap::STATUS_REJECTED], true)) {
                    $emit("swap-{$w->id}-decided", $w->decided_at, "swap-{$w->id}", $ref, $approved ? 'The swap is approved' : 'The swap is turned down', $detail, 'office', 'store_manager', $approved ? ['final' => true] : ['final' => true, 'bad' => true]);
                }
            });

        // Keys changing hands.
        KeyHandover::query()
            ->with(['key.keyable', 'from:id,first_name,store_id', 'to:id,first_name,store_id'])
            ->where(fn ($q) => $q->whereBetween('created_at', [$from, $to])->orWhereBetween('decided_at', [$from, $to]))
            ->orderBy('created_at')
            ->limit(200)
            ->get()
            ->each(function (KeyHandover $h) use ($emit, $name, $mine): void {
                if (! $mine($h->from) && ! $mine($h->to)) {
                    return;
                }
                $keyable = $h->key?->keyable;
                $label = (string) ($keyable?->getAttribute('name') ?? $keyable?->getAttribute('plate_number') ?? $keyable?->getAttribute('plate') ?? 'a key');
                $ref = 'Key · '.$label;
                $emit("key-{$h->id}-claimed", $h->created_at, "key-{$h->id}", $ref, $name($h->from, 'Someone').' hands the key to '.$name($h->to, 'someone'), $label, 'office', 'seller');
                if (in_array($h->status, [KeyHandover::STATUS_ACCEPTED, KeyHandover::STATUS_FORCED], true)) {
                    $emit("key-{$h->id}-decided", $h->decided_at, "key-{$h->id}", $ref, $name($h->to, 'Someone').' has the key', $label, 'office', 'seller', ['final' => true]);
                } elseif ($h->status === KeyHandover::STATUS_REJECTED) {
                    $emit("key-{$h->id}-decided", $h->decided_at, "key-{$h->id}", $ref, $name($h->to, 'Someone').' refuses the key', $label, 'office', 'seller', ['final' => true, 'bad' => true]);
                }
            });

        // Leave.
        LeaveRequest::query()
            ->with('user:id,first_name,store_id')
            ->where(fn ($q) => $q->whereBetween('created_at', [$from, $to])->orWhereBetween('decided_at', [$from, $to]))
            ->orderBy('created_at')
            ->limit(200)
            ->get()
            ->each(function (LeaveRequest $l) use ($emit, $name, $mine): void {
                if (! $mine($l->user)) {
                    return;
                }
                $detail = ucfirst((string) $l->type).' · '.$l->starts_on?->format('M j').' – '.$l->ends_on?->format('M j');
                $emit("leave-{$l->id}-asked", $l->created_at, "leave-{$l->id}", 'Leave #'.$l->id, $name($l->user, 'Someone').' asks for leave', $detail, 'office', 'seller');
                if ($l->status === LeaveRequest::STATUS_APPROVED) {
                    $emit("leave-{$l->id}-decided", $l->decided_at, "leave-{$l->id}", 'Leave #'.$l->id, 'Leave approved for '.$name($l->user, 'someone'), $detail, 'office', 'store_manager', ['final' => true]);
                } elseif ($l->status === LeaveRequest::STATUS_REJECTED) {
                    $emit("leave-{$l->id}-decided", $l->decided_at, "leave-{$l->id}", 'Leave #'.$l->id, 'Leave turned down for '.$name($l->user, 'someone'), $detail, 'office', 'store_manager', ['final' => true, 'bad' => true]);
                }
            });

        // Staff rides.
        StaffRide::query()
            ->with(['driver:id,first_name,store_id', 'site', 'vehicle'])
            ->where(fn ($q) => $q->whereBetween('claimed_at', [$from, $to])->orWhereBetween('departed_at', [$from, $to])->orWhereBetween('finished_at', [$from, $to]))
            ->orderBy('departs_at')
            ->limit(200)
            ->get()
            ->each(function (StaffRide $r) use ($emit, $name, $mine, $mainStoreId): void {
                if (! $mine($r->driver)) {
                    return;
                }
                $where = $this->placeKey($r->site, $mainStoreId) ?? 'office';
                $detail = 'Staff ride · '.($r->site?->name ?? 'a site');
                $driver = $name($r->driver, 'A driver');
                $emit("ride-{$r->id}-claimed", $r->claimed_at, "ride-{$r->id}", 'Ride #'.$r->id, $driver.' takes the staff ride', $detail, $where, 'delivery');
                $emit("ride-{$r->id}-departed", $r->departed_at, "ride-{$r->id}", 'Ride #'.$r->id, $driver.' sets off with the staff', $detail, $where, 'delivery');
                $emit("ride-{$r->id}-finished", $r->finished_at, "ride-{$r->id}", 'Ride #'.$r->id, 'The staff ride is done', $detail, $where, 'delivery', ['final' => true]);
            });

        return $out;
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

                $emit('raised', $t->created_at, 'A transfer is raised'.($t->initiator ? ' by '.$t->initiator->first_name : ''), $origin, 'stock_keeper');
                $emit('dispatched', $t->dispatched_at, $t->courier_id !== null ? 'Handed to the courier'.($t->courier ? ' '.$t->courier->first_name : '') : 'Sent', $origin, 'stock_keeper');
                $emit('handed', $t->handed_over_at, $t->courier ? $t->courier->first_name.' hands it over' : 'The courier hands it over', $destination, 'delivery');
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
            ->with(['location', 'starter:id,first_name', 'submitter:id,first_name', 'approver:id,first_name'])
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

                $emit('started', $s->created_at, $s->starter ? $s->starter->first_name.' starts a count' : 'A count starts', 'stock_keeper');
                $emit('submitted', $s->submitted_at, $s->submitter ? $s->submitter->first_name.' submits the count for approval' : 'The count is submitted for approval', 'stock_keeper');
                $emit('posted', $s->posted_at, $s->approver ? 'Approved by '.$s->approver->first_name.', a second person: adjustments booked' : 'Approved by a second person: adjustments booked', 'store_manager', ['final' => true]);
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
            'seller' => $sale->seller?->first_name,
            'picker' => $sale->pickingStartedBy?->first_name,
            'courier' => $delivery?->courier?->first_name,
            'payments' => $sale->payments
                ->where('kind', '!=', Payment::KIND_REPAYMENT)
                ->map(fn (Payment $p): array => [
                    'method' => (string) $p->payment_method,
                    'status' => (string) $p->status,
                    'amount' => (float) $p->amount,
                    'claimed_at' => ($p->claimed_at ?? $p->paid_at ?? $p->created_at)?->toIso8601String(),
                    'confirmed_at' => $p->confirmed_at?->toIso8601String(),
                    'claimed_by' => $p->claimer?->first_name,
                    'confirmed_by' => $p->confirmer?->first_name,
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
            ->with(['originLocation', 'destinationLocation', 'courier:id,first_name,last_name', 'creator:id,first_name,last_name', 'preparer:id,first_name', 'receiver:id,first_name',
                'vehicle:id,max_cbm', 'items.itemVariant.packagingQuantities'])
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

    /** Packaging tiers (ItemVariant::packagingTier), biggest first: an item's top packaging is the first it has. */
    private const TIER_ORDER = ['cartoon', 'box', 'bag', 'bundle', 'doz', 'packet', 'piece'];

    /**
     * The catalogue as the hubs show it: one row per item, for the variant in
     * its biggest packaging (a carton before a box before a piece), with that
     * packaging's pieces and cbm. `boxes` says how many of that packaging each
     * place really holds (main_hub_a, main_hub_b, remote_hub, store_floor; a place with
     * none is left out): the stock there in pieces over the packaging's pieces,
     * at least one while anything is there. Items with no variant are left out.
     * Sorted by name.
     *
     * @return array<int, array<string, mixed>>
     */
    public function catalogue(): array
    {
        $variants = ItemVariant::query()
            ->with(['item:id,product_name', 'itemPackagingType:id,name', 'packagingQuantities'])
            ->whereHas('item')
            ->get(['id', 'item_id', 'item_packaging_type_id']);

        $rank = fn (ItemVariant $v): int => ($i = array_search($v->packagingTier(), self::TIER_ORDER, true)) === false ? count(self::TIER_ORDER) : $i;
        $stock = $this->piecesByPlace();
        $ladders = $this->ladder->forItems($variants->pluck('item_id')->unique()->all());

        return $variants
            ->groupBy('item_id')
            ->map(function (Collection $group) use ($rank, $stock, $ladders): array {
                /** @var ItemVariant $top */
                $top = $group->sortBy(fn (ItemVariant $v): array => [$rank($v), $v->id])->first();
                $pack = $top->packagingQuantities->firstWhere('id', $top->item_packaging_type_id);
                $per = max(1, $pack ? (int) $pack->pivot->quantity : 1);
                $boxes = [];
                foreach ($stock[(int) $top->item_id] ?? [] as $place => $pieces) {
                    $boxes[$place] = max(1, (int) round($pieces / $per));
                }

                return [
                    'item_id' => (int) $top->item_id,
                    'name' => (string) $top->item->product_name,
                    'variant_id' => (int) $top->id,
                    'packaging' => $top->itemPackagingType?->name,
                    'tier' => $top->packagingTier(),
                    'pieces' => $pack ? (int) $pack->pivot->quantity : null,
                    'cbm' => $pack && $pack->pivot->cbm !== null ? (float) $pack->pivot->cbm : null,
                    'boxes' => $boxes,
                    // What a carton holds, biggest first: the world writes it under the name (1 Carton = 20 Packets = 1000 Pieces).
                    'pack' => collect($ladders[(int) $top->item_id] ?? [])->map(fn (array $t): array => ['name' => (string) $t['name'], 'pieces' => (int) $t['pieces']])->sortByDesc('pieces')->values()->all(),
                ];
            })
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->all();
    }

    /**
     * Pieces of each item in Main Hub A, Main Hub B, the Remote Hub and the Main Store's floor (what the world stands boxes for).
     *
     * @return array<int, array<string, int>> item id => place key => pieces
     */
    private function piecesByPlace(): array
    {
        $mainStoreId = $this->mainStoreId();
        $out = [];

        ItemStock::query()
            ->join('stock_locations as sl', 'sl.id', '=', 'item_stocks.stock_location_id')
            ->join('item_variants as iv', 'iv.id', '=', 'item_stocks.item_variant_id')
            ->where('item_stocks.quantity', '>', 0)
            ->where(fn ($q) => $q->where('sl.kind', StockLocation::KIND_MAIN_HUB)
                ->orWhere(fn ($remote) => $remote->where('sl.kind', StockLocation::KIND_REMOTE_HUB)->where('sl.store_id', $mainStoreId ?? 0))
                ->orWhere(fn ($floor) => $floor->whereIn('sl.kind', [StockLocation::KIND_STORE, StockLocation::KIND_BACKROOM])->where('sl.store_id', $mainStoreId ?? 0)))
            ->get(['iv.item_id', 'item_stocks.item_variant_id', 'item_stocks.quantity', 'sl.kind', 'sl.name'])
            ->each(function ($row) use (&$out): void {
                $place = $row->kind === StockLocation::KIND_REMOTE_HUB ? 'remote_hub' : ($row->kind === StockLocation::KIND_MAIN_HUB
                    ? (preg_match('/\bA$/', trim((string) $row->name)) ? 'main_hub_a' : (preg_match('/\bB$/', trim((string) $row->name)) ? 'main_hub_b' : null))
                    : 'store_floor');
                if ($place === null) {
                    return;
                }
                $out[(int) $row->item_id][$place] = ($out[(int) $row->item_id][$place] ?? 0) + (int) $row->quantity * $this->ladder->piecesPerUnit((int) $row->item_variant_id);
            });

        return $out;
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
                'in_unit' => $bin['in_unit'],
                'status' => $bin['status'],
                'assigned' => $bin['assigned'],
                // The slot of the racks it stands on ("f6c"), or null: the world fills unplaced bins in order.
                'spot' => $bin['spot'],
                'band' => $bin['band'] === null ? null : [
                    'max' => $bin['band']['max'], 'refill' => $bin['band']['refill'], 'critical' => $bin['band']['critical'], 'unit' => $bin['unit']['name'],
                ],
            ])
            ->values()
            ->all();
    }

    /**
     * What the viewer may do to the shelf from the world: put its bins on slots of the racks. Only the admin and seller
     * apps have the route (and, as on the item page, only whoever may edit the planogram).
     *
     * @return array{location_id: int|null, can_place: bool}
     */
    public function shelfEdit(User $viewer, string $app): array
    {
        $shelf = StockLocation::query()
            ->where('kind', StockLocation::KIND_SHELF)
            ->whereIn('store_id', StockLocation::query()->where('kind', StockLocation::KIND_STORE)->where('name', self::MAIN_STORE)->select('store_id'))
            ->first();

        if ($shelf === null || ! in_array($app, ['admin', 'seller'], true) || ($viewer->store_id !== null && (int) $viewer->store_id !== (int) $shelf->store_id)) {
            return ['location_id' => $shelf?->id !== null ? (int) $shelf->id : null, 'can_place' => false];
        }

        return ['location_id' => (int) $shelf->id, 'can_place' => app(StockPermissions::class)->canEditPlanogram($viewer, $shelf)];
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
            'preparer' => $shipment->preparer?->first_name,
            'receiver' => $shipment->receiver?->first_name,
            'items' => (int) ($shipment->items_count ?? 0),
            'cbm' => round((float) ($shipment->items_sum_cbm ?? 0), 2),
            // How full its vehicle is: the manifest's volume against what the vehicle takes (null: no vehicle yet).
            ...$this->load($shipment),
            'created_at' => $shipment->created_at?->toIso8601String(),
            'scheduled_for' => ($shipment->agreed_scheduled_for ?? $shipment->scheduled_for)?->toIso8601String(),
            'eta' => $shipment->eta?->toIso8601String(),
            'cancelled_at' => $shipment->cancelled_at?->toIso8601String(),
            'parties' => $parties,
            'steps' => $steps,
        ];
    }

    /**
     * The manifest's volume in m³: each line's recorded cbm, else its quantity times its unit's size
     * (item_variant_packaging_quantity.cbm). `load_guessed` when a line has neither, so the figure is short.
     *
     * @return array{load_cbm: float, load_guessed: bool, capacity: float|null}
     */
    private function load(Shipment $shipment): array
    {
        $cbm = 0.0;
        $guessed = false;

        foreach ($shipment->items as $line) {
            $unit = $this->ownUnitCbm($line->itemVariant);
            $size = $line->cbm !== null && (float) $line->cbm > 0 ? (float) $line->cbm : ($unit !== null ? $unit * (int) $line->quantity : null);
            $guessed = $guessed || $size === null;
            $cbm += $size ?? 0.0;
        }

        $capacity = (float) ($shipment->vehicle_max_cbm ?? $shipment->vehicle?->max_cbm ?? 0);

        return ['load_cbm' => round($cbm, 2), 'load_guessed' => $guessed, 'capacity' => $capacity > 0 ? round($capacity, 2) : null];
    }

    /**
     * The containers being filled at the Storage hub: consignments still forming or at the overseas warehouse, with
     * their lines' volume against a 40 ft container. For admins, procurement and stock keepers (they receive them).
     *
     * @return array<int, array{id: int, reference: string, stage: string, container_number: string|null, lines: int, cbm: float, guessed: bool, capacity: float}>
     */
    public function containers(User $viewer): array
    {
        if (! $viewer->hasAnyRole(['admin', 'procurement', 'stock_keeper'])) {
            return [];
        }

        return Consignment::query()
            ->whereIn('stage', [Consignment::FORMING, 'overseas_warehouse'])
            ->with('lines:id,consignment_id,cbm')
            ->orderBy('id')
            ->get(['id', 'reference', 'stage', 'container_number'])
            ->map(fn (Consignment $c): array => [
                'id' => (int) $c->id,
                'reference' => (string) $c->reference,
                'stage' => (string) $c->stage,
                'container_number' => $c->container_number,
                'lines' => $c->lines->count(),
                'cbm' => round((float) $c->lines->sum('cbm'), 2),
                'guessed' => $c->lines->contains(fn ($line): bool => $line->cbm === null),
                'capacity' => self::CONTAINER_CBM,
            ])
            ->values()
            ->all();
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
