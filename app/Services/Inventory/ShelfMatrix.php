<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Services\StockService;
use App\Services\TransferWorkflowService;
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
 * A refill request moves the shortfall from the store's floor onto the shelf
 * as a same-site transfer — staff carry it across, no courier.
 */
class ShelfMatrix
{
    public const COLUMNS = ['A', 'B', 'C', 'D', 'E'];

    public const ROWS = 10;

    public const PER_TIER = 50;

    public function __construct(
        private readonly PackagingLadder $ladder,
        private readonly StockService $stock,
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
                'critical' => $bins->where('status', 'critical')->count(),
            ],
        ];
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
     * Ask for the shortfall to come from the store floor onto the shelf.
     *
     * Moves the item's variant packed in the band's unit (or, failing that,
     * the one with the most on the floor), as many whole units as close the
     * gap to max without exceeding what the floor holds.
     *
     * @throws InvalidArgumentException when there is nothing to move
     */
    public function requestRefill(StockLocation $shelf, Item $item, ?User $by = null): Transfer
    {
        $this->assertShelf($shelf);

        $band = ShelfItemBand::query()->where('stock_location_id', $shelf->id)->where('item_id', $item->id)->first();

        if ($band === null) {
            throw new InvalidArgumentException("Set {$item->product_name}'s band before asking for a refill.");
        }

        $floor = StockLocation::query()
            ->where('parent_id', $shelf->parent_id)
            ->where('kind', StockLocation::KIND_BACKROOM)
            ->firstOrFail();

        $bin = $this->bin($shelf, $item, $band);
        $shortfallPieces = $bin['max_pieces'] - $bin['pieces'];

        if ($shortfallPieces <= 0) {
            throw new InvalidArgumentException("{$item->product_name} is already full.");
        }

        // The floor's variants of this item, the band's unit first.
        $candidates = ItemStock::query()
            ->with('itemVariant')
            ->where('stock_location_id', $floor->id)
            ->whereHas('itemVariant', fn ($q) => $q->where('item_id', $item->id))
            ->get()
            ->map(fn (ItemStock $row): array => [
                'variant_id' => (int) $row->item_variant_id,
                'packaging_type_id' => $row->itemVariant?->item_packaging_type_id,
                'per' => $this->ladder->piecesPerUnit((int) $row->item_variant_id),
                'available' => $this->stock->availableAt((int) $row->item_variant_id, $floor),
            ])
            ->filter(fn (array $c): bool => $c['available'] > 0)
            ->sortByDesc(fn (array $c): int => ((int) $c['packaging_type_id'] === (int) $band->item_packaging_type_id ? 1_000_000 : 0) + $c['available']);

        foreach ($candidates as $candidate) {
            $units = min($candidate['available'], intdiv($shortfallPieces, $candidate['per']));

            if ($units > 0) {
                return app(TransferWorkflowService::class)->create(
                    variantId: $candidate['variant_id'],
                    fromStoreId: null,
                    toStoreId: null,
                    quantity: $units,
                    initiatedBy: $by?->id,
                    notes: "Shelf refill for {$item->product_name}",
                    sourceLocationType: StockLocation::class,
                    sourceLocationId: (int) $floor->id,
                    destinationLocationType: StockLocation::class,
                    destinationLocationId: (int) $shelf->id,
                );
            }
        }

        throw new InvalidArgumentException("The store floor has no {$item->product_name} to bring out.");
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
        ];
    }

    private function assertShelf(StockLocation $shelf): void
    {
        if ($shelf->kind !== StockLocation::KIND_SHELF) {
            throw new InvalidArgumentException("{$shelf->name} is not a Store Shelf.");
        }
    }
}
