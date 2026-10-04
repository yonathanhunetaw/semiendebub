<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Services\StockService;
use App\Services\TransferWorkflowService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Works out where a shelf bin's refill comes from, and raises it.
 *
 * A bin (an item assigned to a Store Shelf, with max / refill / crit low) that
 * is at or below its refill line is short by `max − on shelf`. What is already
 * on its way is taken off first, so a second look never asks twice. The rest is
 * drawn from the item's refill route, in order:
 *
 *   floor       as much as the store floor can give, as floor → shelf
 *               transfers straight onto the stock keeper's shelving list. No
 *               approval: it is a walk across the store.
 *   remote_hub  as much as the store's Remote Hub can give, as a request that
 *               waits for the store manager (then the hub accepts, a courier
 *               carries it to the floor).
 *   shipment    whatever is still short, as a line for the next shipment from
 *               Hub A/B to the floor. Waits for the store manager; no hub is
 *               chosen until the shipment is built.
 *
 * Example: the bin needs 50, the floor has 20 → 20 are shelved now and 30 go
 * to the next source on the route.
 *
 * Remote Hub and shipment legs are per item per store. A second need for the
 * same item adds to a leg still awaiting approval instead of opening another,
 * so two shelves short of pens make one shipment line.
 *
 * Quantities are counted in pieces and raised in whole units of a pack: a
 * remainder smaller than one pack of the band's unit is not escalated, since
 * nothing farther away ships a fraction of a pack.
 */
class RefillEngine
{
    public function __construct(
        private readonly PackagingLadder $ladder,
        private readonly StockService $stock,
        private readonly TransferWorkflowService $transfers,
    ) {
    }

    /*
    |--------------------------------------------------------------------------
    | The route
    |--------------------------------------------------------------------------
    */

    /** @return array<int, string> the store's ordered sources for this item */
    public function routeFor(int $storeId, int $itemId): array
    {
        $route = ItemRefillRoute::query()->where('store_id', $storeId)->where('item_id', $itemId)->first();

        return $route !== null ? array_values($route->sources) : ItemRefillRoute::DEFAULT_SOURCES;
    }

    /**
     * @param  array<int, string>  $sources  ordered; each at most once
     *
     * @throws InvalidArgumentException when a source is unknown, repeated, or none is given
     */
    public function setRoute(int $storeId, Item $item, array $sources, ?User $by = null): ItemRefillRoute
    {
        $sources = array_values($sources);

        if ($sources === []) {
            throw new InvalidArgumentException('A refill route needs at least one source.');
        }

        if (array_diff($sources, ItemRefillRoute::SOURCES) !== []) {
            throw new InvalidArgumentException('A refill route may only use the store floor, the Remote Hub and shipments.');
        }

        if (count($sources) !== count(array_unique($sources))) {
            throw new InvalidArgumentException('Each source may appear once in a refill route.');
        }

        return ItemRefillRoute::query()->updateOrCreate(
            ['store_id' => $storeId, 'item_id' => $item->id],
            ['sources' => $sources, 'updated_by' => $by?->id],
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Raising
    |--------------------------------------------------------------------------
    */

    /**
     * Raise what this bin is still short of.
     *
     * Automatic raises only fire at or below the refill line. A stock keeper
     * may raise by hand at any level — the shelf looks short — and may start
     * further down the route with $startAt, e.g. straight to the Remote Hub when
     * the floor's count is wrong.
     *
     * @param  string  $origin  RefillRequest::ORIGIN_AUTO or ORIGIN_MANUAL
     * @param  string|null  $startAt  skip the route's sources before this one
     * @return array{result: string, message: string, legs: array<int, RefillRequest>, need_pieces: int, uncovered_pieces: int, urgent: bool}
     *
     * @throws InvalidArgumentException when the item has no bin on the shelf, or $startAt is not on its route
     */
    public function raise(StockLocation $shelf, Item $item, string $origin = RefillRequest::ORIGIN_AUTO, ?User $by = null, ?string $startAt = null): array
    {
        if ($shelf->kind === StockLocation::KIND_REMOTE_HUB) {
            return $this->raiseForHub($shelf, $item, $origin, $by);
        }

        $this->assertShelf($shelf);

        return DB::transaction(function () use ($shelf, $item, $origin, $by, $startAt): array {
            // The bin's row serialises raises for one bin; the store's row
            // serialises merges into the store's per-item legs.
            $band = ShelfItemBand::query()
                ->where('stock_location_id', $shelf->id)
                ->where('item_id', $item->id)
                ->lockForUpdate()
                ->first();

            if ($band === null) {
                throw new InvalidArgumentException("{$item->product_name} has no bin on {$shelf->name}. A shelf manager has to assign it first.");
            }

            Store::query()->whereKey($shelf->store_id)->lockForUpdate()->first();

            $storeId = (int) $shelf->store_id;
            $route = $this->routeFor($storeId, (int) $item->id);

            if ($startAt !== null) {
                $position = array_search($startAt, $route, true);

                if ($position === false) {
                    throw new InvalidArgumentException("{$item->product_name}'s refill route does not use ".$this->sourceLabel($startAt).'.');
                }

                $route = array_slice($route, (int) $position);
            }

            $lines = $this->lines($shelf, $item, $band);
            $current = $this->piecesAt((int) $shelf->id, (int) $item->id);
            $urgent = $current <= $lines['critical'];

            $outcome = fn (string $result, string $message, array $legs = [], int $need = 0, int $uncovered = 0): array => [
                'result' => $result,
                'message' => $message,
                'legs' => $legs,
                'need_pieces' => $need,
                'uncovered_pieces' => $uncovered,
                'urgent' => $urgent,
            ];

            if ($origin === RefillRequest::ORIGIN_AUTO && $current > $lines['refill']) {
                return $outcome('not_needed', "{$item->product_name} is above its refill line.");
            }

            $shortfall = $lines['max'] - $current;

            if ($shortfall <= 0) {
                return $outcome('not_needed', "{$item->product_name} is already full.");
            }

            $need = $shortfall - $this->inFlightPieces($shelf, (int) $item->id);

            if ($need <= 0) {
                return $outcome('covered', "{$item->product_name}'s refill is already on its way.");
            }

            $remaining = $need;
            $legs = [];
            $context = [
                'shelf' => $shelf,
                'target' => $shelf,
                'destination' => RefillRequest::DESTINATION_STORE,
                'store_id' => $storeId,
                'item' => $item,
                'band' => $band,
                'origin' => $origin,
                'by' => $by,
                'urgent' => $urgent,
            ];

            foreach ($route as $source) {
                if ($remaining <= 0) {
                    break;
                }

                [$taken, $sourceLegs] = match ($source) {
                    ItemRefillRoute::SOURCE_FLOOR => $this->fromFloor($context, $remaining),
                    ItemRefillRoute::SOURCE_REMOTE_HUB => $this->fromRemoteHub($context, $remaining),
                    ItemRefillRoute::SOURCE_SHIPMENT => $this->fromShipment($context, $remaining),
                    default => [0, []],
                };

                $remaining -= $taken;
                array_push($legs, ...$sourceLegs);
            }

            if ($legs === []) {
                return $outcome('uncovered', "Nothing on {$item->product_name}'s refill route can cover it.", [], $need, $remaining);
            }

            return $outcome(
                'raised',
                $this->summary($item, $legs),
                $legs,
                $need,
                max(0, $remaining),
            );
        });
    }

    /**
     * Raise for every bin on the shelf that is at or below its refill line.
     *
     * @return array<int, array{item_id: int, result: string, message: string}>
     */
    public function sweep(StockLocation $shelf, ?User $by = null): array
    {
        if ($shelf->kind !== StockLocation::KIND_REMOTE_HUB) {
            $this->assertShelf($shelf);
        }

        $results = [];
        $bands = ShelfItemBand::query()->where('stock_location_id', $shelf->id)->with('item')->get();

        foreach ($bands as $band) {
            if ($band->item === null) {
                continue;
            }

            try {
                $outcome = $this->raise($shelf, $band->item, RefillRequest::ORIGIN_AUTO, $by);
                $results[] = ['item_id' => (int) $band->item_id, 'result' => $outcome['result'], 'message' => $outcome['message']];
            } catch (InvalidArgumentException $e) {
                $results[] = ['item_id' => (int) $band->item_id, 'result' => 'failed', 'message' => $e->getMessage()];
            }
        }

        return $results;
    }

    /**
     * A Remote Hub restocking its own lines: whatever it is short of its max,
     * net of what is already coming, as a suggestion for a shipment from Hub A
     * or B to the hub. Nothing else can fill a Remote Hub.
     *
     * @return array{result: string, message: string, legs: array<int, RefillRequest>, need_pieces: int, uncovered_pieces: int, urgent: bool}
     */
    private function raiseForHub(StockLocation $hub, Item $item, string $origin, ?User $by): array
    {
        return DB::transaction(function () use ($hub, $item, $origin, $by): array {
            $band = ShelfItemBand::query()
                ->where('stock_location_id', $hub->id)
                ->where('item_id', $item->id)
                ->lockForUpdate()
                ->first();

            if ($band === null) {
                throw new InvalidArgumentException("{$item->product_name} has no line at {$hub->name}. A manager has to set one first.");
            }

            Store::query()->whereKey($hub->store_id)->lockForUpdate()->first();

            $lines = $this->lines($hub, $item, $band);
            $current = $this->piecesAt((int) $hub->id, (int) $item->id);
            $urgent = $current <= $lines['critical'];

            $outcome = fn (string $result, string $message, array $legs = [], int $need = 0, int $uncovered = 0): array => [
                'result' => $result,
                'message' => $message,
                'legs' => $legs,
                'need_pieces' => $need,
                'uncovered_pieces' => $uncovered,
                'urgent' => $urgent,
            ];

            if ($origin === RefillRequest::ORIGIN_AUTO && $current > $lines['refill']) {
                return $outcome('not_needed', "{$item->product_name} is above its refill line at {$hub->name}.");
            }

            $shortfall = $lines['max'] - $current;

            if ($shortfall <= 0) {
                return $outcome('not_needed', "{$item->product_name} is already full at {$hub->name}.");
            }

            $need = $shortfall - $this->inFlightToLocation($hub, (int) $item->id);

            if ($need <= 0) {
                return $outcome('covered', "{$item->product_name}'s restock for {$hub->name} is already on its way.");
            }

            [$taken, $legs] = $this->fromShipment([
                'shelf' => null,
                'target' => $hub,
                'destination' => RefillRequest::DESTINATION_REMOTE_HUB,
                'store_id' => (int) $hub->store_id,
                'item' => $item,
                'band' => $band,
                'origin' => $origin,
                'by' => $by,
                'urgent' => $urgent,
            ], $need);

            if ($legs === []) {
                return $outcome('uncovered', "Less than one pack of {$item->product_name} is short at {$hub->name}.", [], $need, $need);
            }

            return $outcome('raised', $this->summary($item, $legs), $legs, $need, max(0, $need - $taken));
        });
    }

    /**
     * Pieces of this item already heading for a Remote Hub: open transfers
     * into it, and open legs restocking it (including store legs the manager
     * chose to ship to the hub).
     */
    public function inFlightToLocation(StockLocation $location, int $itemId): int
    {
        $variantIds = $this->variantIds($itemId);

        $transfers = Transfer::query()
            ->whereIn('item_variant_id', $variantIds)
            ->where('destination_location_type', StockLocation::class)
            ->where('destination_location_id', $location->id)
            ->whereIn('status', [TransferWorkflowService::STATUS_PENDING, TransferWorkflowService::STATUS_IN_TRANSIT])
            ->where('approval_state', '!=', Transfer::APPROVAL_REJECTED)
            ->get(['item_variant_id', 'quantity']);

        $legs = RefillRequest::query()
            ->open()
            ->where('item_id', $itemId)
            ->where('target_location_id', $location->id)
            ->get(['item_variant_id', 'quantity']);

        return $transfers->concat($legs)
            ->sum(fn ($row): int => (int) $row->quantity * $this->ladder->piecesPerUnit((int) $row->item_variant_id));
    }

    /*
    |--------------------------------------------------------------------------
    | What is already on its way
    |--------------------------------------------------------------------------
    */

    /**
     * Pieces of this item already heading for the shelf: open transfers onto
     * it, plus the store's open Remote Hub and shipment legs for the item (they
     * land on the floor, but they are there to fill this shelf).
     */
    public function inFlightPieces(StockLocation $shelf, int $itemId): int
    {
        $variantIds = $this->variantIds($itemId);

        $transfers = Transfer::query()
            ->whereIn('item_variant_id', $variantIds)
            ->where('destination_location_type', StockLocation::class)
            ->where('destination_location_id', $shelf->id)
            ->whereIn('status', [TransferWorkflowService::STATUS_PENDING, TransferWorkflowService::STATUS_IN_TRANSIT])
            ->where('approval_state', '!=', Transfer::APPROVAL_REJECTED)
            ->get(['item_variant_id', 'quantity']);

        // Legs raised for this shelf (a Remote Hub restocking its own lines is
        // a different target and does not count here).
        $legs = RefillRequest::query()
            ->open()
            ->where('store_id', $shelf->store_id)
            ->where('item_id', $itemId)
            ->where(fn ($q) => $q->where('target_location_id', $shelf->id)->orWhereNull('target_location_id'))
            ->whereIn('source', [ItemRefillRoute::SOURCE_REMOTE_HUB, ItemRefillRoute::SOURCE_SHIPMENT])
            ->get(['item_variant_id', 'quantity']);

        return $transfers->concat($legs)
            ->sum(fn ($row): int => (int) $row->quantity * $this->ladder->piecesPerUnit((int) $row->item_variant_id));
    }

    /*
    |--------------------------------------------------------------------------
    | Sources
    |--------------------------------------------------------------------------
    */

    /**
     * @param  array<string, mixed>  $context
     * @return array{0: int, 1: array<int, RefillRequest>}
     */
    private function fromFloor(array $context, int $remaining): array
    {
        /** @var StockLocation $shelf */
        $shelf = $context['shelf'];
        $floor = StockLocation::query()
            ->where('parent_id', $shelf->parent_id)
            ->where('kind', StockLocation::KIND_BACKROOM)
            ->first();

        if ($floor === null) {
            return [0, []];
        }

        $taken = 0;
        $legs = [];

        foreach ($this->plan($context, $floor, $remaining) as [$variantId, $units, $per]) {
            $transfer = $this->transfers->create(
                variantId: $variantId,
                fromStoreId: null,
                toStoreId: null,
                quantity: $units,
                initiatedBy: $context['by']?->id,
                notes: "Shelf refill for {$context['item']->product_name}",
                sourceLocationType: StockLocation::class,
                sourceLocationId: (int) $floor->id,
                destinationLocationType: StockLocation::class,
                destinationLocationId: (int) $shelf->id,
            );

            $legs[] = $this->newLeg($context, ItemRefillRoute::SOURCE_FLOOR, $variantId, $units, [
                'status' => RefillRequest::STATUS_IN_PROGRESS,
                'approved_at' => now(),
                'transfer_id' => $transfer->id,
            ]);
            $taken += $units * $per;
        }

        return [$taken, $legs];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{0: int, 1: array<int, RefillRequest>}
     */
    private function fromRemoteHub(array $context, int $remaining): array
    {
        $hub = StockLocation::query()
            ->where('store_id', $context['store_id'])
            ->where('kind', StockLocation::KIND_REMOTE_HUB)
            ->first();

        if ($hub === null) {
            return [0, []];
        }

        $taken = 0;
        $legs = [];

        foreach ($this->plan($context, $hub, $remaining) as [$variantId, $units, $per]) {
            $legs[] = $this->mergeOrCreate($context, ItemRefillRoute::SOURCE_REMOTE_HUB, $variantId, $units);
            $taken += $units * $per;
        }

        return [$taken, $legs];
    }

    /**
     * Whatever is still short, in whole packs of the band's unit. The hubs are
     * not checked: which hub sends it is decided when the shipment is built.
     *
     * @param  array<string, mixed>  $context
     * @return array{0: int, 1: array<int, RefillRequest>}
     */
    private function fromShipment(array $context, int $remaining): array
    {
        $variant = $this->bandVariant($context['item'], $context['band']);

        if ($variant === null) {
            return [0, []];
        }

        $per = $this->ladder->piecesPerUnit((int) $variant->id);
        $units = intdiv($remaining, $per);

        if ($units <= 0) {
            return [0, []];
        }

        return [$units * $per, [$this->mergeOrCreate($context, ItemRefillRoute::SOURCE_SHIPMENT, (int) $variant->id, $units)]];
    }

    /**
     * Whole units to take from one location, the band's pack first, then the
     * biggest packs, so as few units as possible cover the gap without
     * overfilling the bin.
     *
     * What the location can give is its available stock less what open
     * transfers out of it and unapproved legs against it have already claimed.
     *
     * @param  array<string, mixed>  $context
     * @return array<int, array{0: int, 1: int, 2: int}> [variant id, units, pieces per unit]
     */
    private function plan(array $context, StockLocation $from, int $remaining): array
    {
        $bandUnit = $context['band']->item_packaging_type_id;

        $candidates = ItemVariant::query()
            ->where('item_id', $context['item']->id)
            ->get(['id', 'item_packaging_type_id'])
            ->map(fn (ItemVariant $variant): array => [
                'id' => (int) $variant->id,
                'per' => $this->ladder->piecesPerUnit((int) $variant->id),
                'is_band_unit' => $bandUnit !== null && (int) $variant->item_packaging_type_id === (int) $bandUnit,
                'spare' => $this->spareAt((int) $variant->id, $from, (int) $context['store_id']),
            ])
            ->filter(fn (array $c): bool => $c['spare'] > 0)
            ->sortBy([['is_band_unit', 'desc'], ['per', 'desc']]);

        $plan = [];

        foreach ($candidates as $candidate) {
            $units = min($candidate['spare'], intdiv($remaining, $candidate['per']));

            if ($units > 0) {
                $plan[] = [$candidate['id'], $units, $candidate['per']];
                $remaining -= $units * $candidate['per'];
            }
        }

        return $plan;
    }

    /** Units of a variant a location can still give. */
    private function spareAt(int $variantId, StockLocation $location, int $storeId): int
    {
        $available = $this->stock->availableAt($variantId, $location);

        // Raised but not yet dispatched: the stock has not left, but it is spoken for.
        $outbound = (int) Transfer::query()
            ->where('item_variant_id', $variantId)
            ->where('source_location_type', StockLocation::class)
            ->where('source_location_id', $location->id)
            ->where('status', TransferWorkflowService::STATUS_PENDING)
            ->where('approval_state', '!=', Transfer::APPROVAL_REJECTED)
            ->sum('quantity');

        // Remote Hub legs not yet turned into a transfer.
        $claimed = $location->kind === StockLocation::KIND_REMOTE_HUB
            ? (int) RefillRequest::query()
                ->where('store_id', $storeId)
                ->where('item_variant_id', $variantId)
                ->where('source', ItemRefillRoute::SOURCE_REMOTE_HUB)
                ->whereIn('status', [RefillRequest::STATUS_PENDING, RefillRequest::STATUS_APPROVED, RefillRequest::STATUS_IN_PROGRESS])
                ->whereNull('transfer_id')
                ->sum('quantity')
            : 0;

        return max(0, $available - $outbound - $claimed);
    }

    /*
    |--------------------------------------------------------------------------
    | Legs
    |--------------------------------------------------------------------------
    */

    /**
     * Add to the store's leg for this item and source that is still awaiting
     * approval, or open a new one.
     *
     * Only a pending leg is added to: growing one the manager has already
     * approved would slip the extra past them.
     *
     * @param  array<string, mixed>  $context
     */
    private function mergeOrCreate(array $context, string $source, int $variantId, int $units): RefillRequest
    {
        $open = RefillRequest::query()
            ->where('store_id', $context['store_id'])
            ->where('target_location_id', $context['target']->id)
            ->where('item_id', $context['item']->id)
            ->where('item_variant_id', $variantId)
            ->where('source', $source)
            ->where('status', RefillRequest::STATUS_PENDING)
            ->lockForUpdate()
            ->first();

        if ($open !== null) {
            $open->update([
                'quantity' => $open->quantity + $units,
                'requested_quantity' => ($open->requested_quantity ?? $open->quantity) + $units,
                'urgent' => $open->urgent || $context['urgent'],
            ]);

            return $open;
        }

        return $this->newLeg($context, $source, $variantId, $units);
    }

    /**
     * @param  array<string, mixed>  $context
     * @param  array<string, mixed>  $attributes
     */
    private function newLeg(array $context, string $source, int $variantId, int $units, array $attributes = []): RefillRequest
    {
        return RefillRequest::query()->create($attributes + [
            'reference' => $this->nextReference(),
            'store_id' => $context['store_id'],
            'shelf_location_id' => $context['shelf']?->id,
            'target_location_id' => $context['target']->id,
            'item_id' => $context['item']->id,
            'item_variant_id' => $variantId,
            'source' => $source,
            'destination' => $source === ItemRefillRoute::SOURCE_SHIPMENT ? $context['destination'] : null,
            'quantity' => $units,
            'requested_quantity' => $units,
            'status' => RefillRequest::STATUS_PENDING,
            'urgent' => $context['urgent'],
            'origin' => $context['origin'],
            'raised_by' => $context['by']?->id,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    /** @return array{max: int, refill: int, critical: int} the band's lines, in pieces */
    private function lines(StockLocation $shelf, Item $item, ShelfItemBand $band): array
    {
        $tiers = $this->ladder->forItem((int) $item->id);
        $unit = $band->item_packaging_type_id !== null
            ? collect($tiers)->firstWhere('id', $band->item_packaging_type_id)
            : null;
        $unit ??= $this->ladder->smallestTier((int) $item->id);
        $per = max(1, (int) $unit['pieces']);

        return [
            'max' => $band->max_units * $per,
            'refill' => $band->refill_units * $per,
            'critical' => $band->critical_units * $per,
        ];
    }

    private function piecesAt(int $locationId, int $itemId): int
    {
        return (int) ItemStock::query()
            ->where('stock_location_id', $locationId)
            ->whereIn('item_variant_id', $this->variantIds($itemId))
            ->get(['item_variant_id', 'quantity'])
            ->sum(fn ($row): int => (int) $row->quantity * $this->ladder->piecesPerUnit((int) $row->item_variant_id));
    }

    /** @return array<int, int> */
    private function variantIds(int $itemId): array
    {
        return ItemVariant::query()->where('item_id', $itemId)->pluck('id')->map(fn ($id): int => (int) $id)->all();
    }

    /** The variant packed in the band's unit; failing that, the item's smallest pack. */
    private function bandVariant(Item $item, ShelfItemBand $band): ?ItemVariant
    {
        $variants = ItemVariant::query()->where('item_id', $item->id)->get(['id', 'item_packaging_type_id']);

        if ($band->item_packaging_type_id !== null) {
            $match = $variants->first(fn (ItemVariant $v): bool => (int) $v->item_packaging_type_id === (int) $band->item_packaging_type_id);

            if ($match !== null) {
                return $match;
            }
        }

        return $variants->sortBy(fn (ItemVariant $v): int => $this->ladder->piecesPerUnit((int) $v->id))->first();
    }

    /** @param  array<int, RefillRequest>  $legs */
    private function summary(Item $item, array $legs): string
    {
        $parts = (new Collection($legs))
            ->groupBy('source')
            ->map(fn (Collection $group, string $source): string => $group->sum('quantity').' '.$this->sourceLabel($source, true))
            ->values()
            ->join(', ');

        return "Refill for {$item->product_name} raised: {$parts}.";
    }

    private function sourceLabel(string $source, bool $from = false): string
    {
        $label = match ($source) {
            ItemRefillRoute::SOURCE_FLOOR => 'the store floor',
            ItemRefillRoute::SOURCE_REMOTE_HUB => 'the Remote Hub',
            ItemRefillRoute::SOURCE_SHIPMENT => 'a shipment',
            default => $source,
        };

        return $from ? ($source === ItemRefillRoute::SOURCE_SHIPMENT ? 'by shipment' : "from {$label}") : $label;
    }

    private function assertShelf(StockLocation $shelf): void
    {
        if ($shelf->kind !== StockLocation::KIND_SHELF || $shelf->store_id === null) {
            throw new InvalidArgumentException("{$shelf->name} is not a Store Shelf.");
        }
    }

    private function nextReference(): string
    {
        return 'RFL-'.now()->format('ymd').'-'.Str::upper(Str::random(5));
    }
}
