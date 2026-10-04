<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\StockKeeper\ItemStock;
use Illuminate\Support\Collection;
use InvalidArgumentException;

/**
 * A Store Shelf as a grid of bins: one item per bin.
 *
 * Bins are laid out A–E across, 1–10 down — fifty to a tier — in a stable
 * order: banded items first (the shelf's planned layout), then anything else on
 * the shelf, by name. An item's bin holds every pack variant of it, so its
 * figure is in pieces and spoken biggest unit first ("40 Packets · 35 Pieces").
 *
 * The band (max, refill line, critical) is set in one of the item's own pack
 * units and compared in pieces:
 *
 *   empty     nothing on the shelf
 *   critical  at or below the critical line
 *   refill    at or below the refill line
 *   ok        above it
 *
 * A bin exists because a shelf manager assigned the item (its band), so an
 * empty bin still shows with its lines. Stock on the shelf for an item with no
 * band reads as unassigned and is never queued for refill. Refills themselves
 * are raised by App\Services\Inventory\RefillEngine.
 */
class ShelfMatrix
{
    public const COLUMNS = ['A', 'B', 'C', 'D', 'E'];

    public const ROWS = 10;

    public const PER_TIER = 50;

    public function __construct(
        private readonly PackagingLadder $ladder,
    ) {
    }

    /**
     * One tier of the shelf, plus the whole shelf's totals.
     *
     * @return array<string, mixed>
     */
    public function forShelf(StockLocation $shelf, int $tier = 1): array
    {
        $this->assertShelf($shelf);

        $bins = $this->allBins($shelf);
        $tiers = max(1, (int) ceil($bins->count() / self::PER_TIER));
        $tier = min(max(1, $tier), $tiers);

        $page = $bins->slice(($tier - 1) * self::PER_TIER, self::PER_TIER)->values()
            ->map(function (array $bin, int $index): array {
                $bin['coord'] = self::COLUMNS[$index % 5].(intdiv($index, 5) + 1);

                return $bin;
            });

        $page = $this->withRefills($shelf, $page);
        $pendingItems = $this->openLegs($shelf)->distinct()->pluck('item_id');

        return [
            'tier' => $tier,
            'tiers' => $tiers,
            'columns' => self::COLUMNS,
            'rows' => self::ROWS,
            'bins' => $page->all(),
            'totals' => [
                'items' => $bins->count(),
                'occupied' => $bins->where('pieces', '>', 0)->count(),
                'pieces' => (int) $bins->sum('pieces'),
                'banded' => $bins->whereNotNull('band')->count(),
                'refill_queue' => $bins->whereIn('status', ['critical', 'refill', 'empty'])->whereNotNull('band')->count(),
                'unassigned' => $bins->where('assigned', false)->count(),
                'critical' => $bins->where('status', 'critical')->count(),
                'refill_pending' => $bins->whereIn('item_id', $pendingItems)->count(),
            ],
        ];
    }

    /**
     * Each bin's open refill legs and its refill route.
     *
     * Legs are per store, so a Remote Hub or shipment leg raised for this
     * shelf's item shows here wherever it was raised from.
     *
     * @param  Collection<int, array<string, mixed>>  $page
     * @return Collection<int, array<string, mixed>>
     */
    private function withRefills(StockLocation $shelf, Collection $page): Collection
    {
        $itemIds = $page->pluck('item_id')->all();

        $legs = $this->openLegs($shelf)
            ->whereIn('item_id', $itemIds)
            ->orderByDesc('urgent')
            ->orderBy('id')
            ->get()
            ->groupBy('item_id');

        $routes = ItemRefillRoute::query()
            ->where('store_id', $shelf->store_id)
            ->whereIn('item_id', $itemIds)
            ->get()
            ->keyBy('item_id');

        return $page->map(function (array $bin) use ($legs, $routes): array {
            $bin['refills'] = ($legs->get($bin['item_id']) ?? collect())
                ->map(fn (RefillRequest $leg): array => [
                    'id' => (int) $leg->id,
                    'reference' => (string) $leg->reference,
                    'source' => (string) $leg->source,
                    'destination' => $leg->destination,
                    'status' => (string) $leg->status,
                    'awaits_hub' => $leg->awaitsHub(),
                    'requested_quantity' => (int) ($leg->requested_quantity ?? $leg->quantity),
                    'urgent' => (bool) $leg->urgent,
                    'quantity' => (int) $leg->quantity,
                    'display' => $this->ladder->label($this->ladder->breakdown(
                        $leg->quantity * $this->ladder->piecesPerUnit((int) $leg->item_variant_id),
                        (int) $bin['item_id'],
                    )),
                ])
                ->values()
                ->all();
            $bin['route'] = array_values($routes->get($bin['item_id'])?->sources ?? ItemRefillRoute::DEFAULT_SOURCES);

            return $bin;
        });
    }

    /**
     * Set (or replace) an item's band on this shelf.
     *
     * @throws InvalidArgumentException when the lines are out of order
     */
    public function setBand(StockLocation $shelf, Item $item, ?int $packagingTypeId, int $max, int $refill, int $critical, ?User $by = null): ShelfItemBand
    {
        $this->assertShelf($shelf);

        if ($max < 1 || $refill > $max || $critical > $refill || $critical < 0) {
            throw new InvalidArgumentException('Lines must read critical ≤ refill ≤ max, with a max of at least one.');
        }

        $tiers = $this->ladder->forItem((int) $item->id);

        if ($packagingTypeId !== null && ! collect($tiers)->contains(fn (array $t): bool => (int) $t['id'] === $packagingTypeId)) {
            throw new InvalidArgumentException("{$item->product_name} is not packed that way.");
        }

        return ShelfItemBand::query()->updateOrCreate(
            ['stock_location_id' => $shelf->id, 'item_id' => $item->id],
            [
                'item_packaging_type_id' => $packagingTypeId,
                'max_units' => $max,
                'refill_units' => $refill,
                'critical_units' => $critical,
                'updated_by' => $by?->id,
            ],
        );
    }

    /**
     * Take an item off the shelf's planogram.
     *
     * Stock already on the shelf stays where it is and shows as unassigned
     * until a manager gives the item a bin again or it is moved off.
     */
    public function removeBand(StockLocation $shelf, Item $item): bool
    {
        $this->assertShelf($shelf);

        return ShelfItemBand::query()
            ->where('stock_location_id', $shelf->id)
            ->where('item_id', $item->id)
            ->delete() > 0;
    }

    /**
     * Every bin on the shelf, in layout order, without tiering.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function bins(StockLocation $shelf): Collection
    {
        $this->assertShelf($shelf);

        return $this->allBins($shelf);
    }

    /**
     * Every bin on the shelf, in layout order.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function allBins(StockLocation $shelf): Collection
    {
        $bands = ShelfItemBand::query()->where('stock_location_id', $shelf->id)->orderBy('id')->get()->keyBy('item_id');

        $onShelf = ItemStock::query()
            ->join('item_variants as iv', 'iv.id', '=', 'item_stocks.item_variant_id')
            ->where('item_stocks.stock_location_id', $shelf->id)
            ->where('item_stocks.quantity', '>', 0)
            ->distinct()
            ->pluck('iv.item_id');

        $itemIds = $bands->keys()->merge($onShelf)->unique()->values();
        $items = Item::query()->whereIn('id', $itemIds)->get()->keyBy('id');
        $this->ladder->forItems($itemIds->all());

        $bins = $itemIds
            ->map(fn (int $id): ?array => $items->has($id) ? $this->bin($shelf, $items[$id], $bands->get($id)) : null)
            ->filter();

        // Planned layout (banded, in the order they were placed) before the rest.
        return $bins->sortBy(fn (array $bin): string => ($bin['band'] !== null ? '0' : '1').
            str_pad((string) ($bin['band']['id'] ?? 0), 10, '0', STR_PAD_LEFT).$bin['name'])->values();
    }

    /** @return array<string, mixed> */
    private function bin(StockLocation $shelf, Item $item, ?ShelfItemBand $band): array
    {
        $pieces = (int) ItemStock::query()
            ->join('item_variants as iv', 'iv.id', '=', 'item_stocks.item_variant_id')
            ->where('item_stocks.stock_location_id', $shelf->id)
            ->where('iv.item_id', $item->id)
            ->get(['item_stocks.item_variant_id', 'item_stocks.quantity'])
            ->sum(fn ($row): int => (int) $row->quantity * $this->ladder->piecesPerUnit((int) $row->item_variant_id));

        $tiers = $this->ladder->forItem((int) $item->id);
        $unit = $band?->item_packaging_type_id !== null
            ? collect($tiers)->firstWhere('id', $band->item_packaging_type_id)
            : null;
        $unit ??= $this->ladder->smallestTier((int) $item->id);
        $per = max(1, (int) $unit['pieces']);

        $maxPieces = $band ? $band->max_units * $per : 0;
        $refillPieces = $band ? $band->refill_units * $per : 0;
        $criticalPieces = $band ? $band->critical_units * $per : 0;

        $status = match (true) {
            $pieces <= 0 => 'empty',
            $band !== null && $pieces <= $criticalPieces => 'critical',
            $band !== null && $pieces <= $refillPieces => 'refill',
            default => 'ok',
        };

        return [
            'item_id' => (int) $item->id,
            'name' => (string) $item->product_name,
            'short' => mb_substr((string) $item->product_name, 0, 8),
            'pieces' => $pieces,
            'display' => $this->ladder->label($this->ladder->breakdown($pieces, (int) $item->id, $tiers)),
            'in_unit' => round($pieces / $per, 1),
            'unit' => ['id' => $unit['id'], 'name' => $unit['name'], 'pieces' => $per],
            'units' => array_map(fn (array $t): array => ['id' => $t['id'], 'name' => $t['name'], 'pieces' => (int) $t['pieces']], $tiers),
            'band' => $band === null ? null : [
                'id' => (int) $band->id,
                'max' => $band->max_units,
                'refill' => $band->refill_units,
                'critical' => $band->critical_units,
            ],
            'max_pieces' => $maxPieces,
            'fill' => $maxPieces > 0 ? round(min(1, $pieces / $maxPieces), 3) : ($pieces > 0 ? 1 : 0),
            'status' => $status,
            // False = stock on the shelf for an item with no bin: shown as
            // unassigned, never queued for refill.
            'assigned' => $band !== null,
        ];
    }

    /**
     * Open refill legs for this location: raised for it (a shelf's legs from
     * before targets were recorded count for the store's shelf).
     *
     * @return \Illuminate\Database\Eloquent\Builder<RefillRequest>
     */
    private function openLegs(StockLocation $location): \Illuminate\Database\Eloquent\Builder
    {
        return RefillRequest::query()
            ->open()
            ->where('store_id', $location->store_id)
            ->where(fn ($q) => $q->where('target_location_id', $location->id)
                ->when($location->kind === StockLocation::KIND_SHELF, fn ($q) => $q->orWhereNull('target_location_id')));
    }

    /** A Store Shelf, or a Remote Hub — which keeps lines per item the same way. */
    private function assertShelf(StockLocation $shelf): void
    {
        if (! in_array($shelf->kind, [StockLocation::KIND_SHELF, StockLocation::KIND_REMOTE_HUB], true)) {
            throw new InvalidArgumentException("{$shelf->name} is not a Store Shelf or a Remote Hub.");
        }
    }
}
