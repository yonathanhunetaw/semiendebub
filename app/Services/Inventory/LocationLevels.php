<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\FloorArea;
use App\Models\Inventory\ItemStock;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Services\ImageResolver;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Stock levels for a warehouse-class location: Main Hub, Remote Hub or a
 * store floor.
 *
 * The same lines a seller sets on a Store Shelf (ShelfMatrix), without the bin
 * grid: an item in a warehouse has no fixed place, only an amount it is set to
 * hold. Lines live in `shelf_item_bands` (keyed by any stock location), in one
 * of the item's own pack units:
 *
 *   max       what the location is set to hold, e.g. 100 Cartons
 *   low       the low-stock alert line, e.g. 20 Cartons
 *   critical  the crit-low line, e.g. 5 Cartons
 *
 * Volume is the location's hand-entered `capacity_cbm` against the CBM of
 * what sits there (quantity × the CBM of the variant's packaging).
 */
class LocationLevels
{
    /** Location kinds this page serves; the shelf has its own matrix. */
    public const KINDS = [
        StockLocation::KIND_MAIN_HUB,
        StockLocation::KIND_REMOTE_HUB,
        StockLocation::KIND_BACKROOM,
    ];

    public function __construct(
        private readonly PackagingLadder $ladder,
        private readonly StockPermissions $permissions,
    ) {
    }

    public function serves(StockLocation $location): bool
    {
        return in_array($location->kind, self::KINDS, true);
    }

    /**
     * May this user set lines and capacity here?
     *
     * Admin, a manager of the location with the planogram tick, or a stock
     * keeper whose scope includes it.
     *
     * @param  array<int, int>|null  $scopeIds  the keeper's location ids; null = every dock
     */
    public function canEdit(?User $user, StockLocation $location, ?array $scopeIds): bool
    {
        if ($user === null || ! $this->serves($location)) {
            return false;
        }

        if ($this->permissions->isAdminOf($user, $location->store_id !== null ? (int) $location->store_id : null)
            || $this->permissions->managerAllows($user, $location, \App\Models\Inventory\FacilityManager::EDIT_PLANOGRAM)) {
            return true;
        }

        return $user->roleKey() === 'stock_keeper'
            && ($scopeIds === null || in_array((int) $location->id, $scopeIds, true));
    }

    /**
     * Everything the levels page shows for one location.
     *
     * @return array<string, mixed>
     */
    public function forLocation(StockLocation $location): array
    {
        $items = $this->rows($location);
        $usedCbm = round((float) $items->sum('cbm'), 2);
        $capacity = $location->capacity_cbm !== null ? (float) $location->capacity_cbm : null;

        return [
            'location' => [
                'id' => (int) $location->id,
                'name' => (string) $location->name,
                'kind' => (string) $location->kind,
                'code' => $location->code,
            ],
            'capacity' => [
                'cbm' => $capacity,
                'used_cbm' => $usedCbm,
                'free_cbm' => $capacity !== null ? round(max(0, $capacity - $usedCbm), 2) : null,
                'percent' => $capacity ? (int) round(min(999, $usedCbm / $capacity * 100)) : null,
            ],
            'counts' => [
                'items' => $items->count(),
                'with_levels' => $items->where('assigned', true)->count(),
                'full' => $items->where('status', 'full')->count(),
                'ok' => $items->where('status', 'ok')->count(),
                'low' => $items->where('status', 'low')->count(),
                'critical' => $items->where('status', 'critical')->count(),
                'empty' => $items->where('status', 'empty')->count(),
            ],
            'items' => $items->values()->all(),
        ];
    }

    /**
     * Set (or replace) an item's lines at a location.
     *
     * @throws InvalidArgumentException when the lines are out of order
     */
    public function setLevel(StockLocation $location, Item $item, ?int $packagingTypeId, int $max, int $low, int $critical, ?User $by = null): ShelfItemBand
    {
        $this->assertServed($location);

        if ($max < 1 || $low > $max || $critical > $low || $critical < 0) {
            throw new InvalidArgumentException('Lines must read crit low ≤ low stock ≤ full, with full at least one.');
        }

        if ($packagingTypeId !== null
            && ! collect($this->ladder->forItem((int) $item->id))->contains(fn (array $t): bool => (int) $t['id'] === $packagingTypeId)) {
            throw new InvalidArgumentException("{$item->product_name} is not packed that way.");
        }

        return ShelfItemBand::query()->updateOrCreate(
            ['stock_location_id' => $location->id, 'item_id' => $item->id],
            [
                'item_packaging_type_id' => $packagingTypeId,
                'max_units' => $max,
                'refill_units' => $low,
                'critical_units' => $critical,
                'updated_by' => $by?->id,
            ],
        );
    }

    public function removeLevel(StockLocation $location, Item $item): bool
    {
        $this->assertServed($location);

        return ShelfItemBand::query()
            ->where('stock_location_id', $location->id)
            ->where('item_id', $item->id)
            ->delete() > 0;
    }

    public function setCapacity(StockLocation $location, ?float $cbm): void
    {
        $this->assertServed($location);

        $location->forceFill(['capacity_cbm' => $cbm])->save();
    }

    /**
     * One row per item that has lines here or stock here.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function rows(StockLocation $location): Collection
    {
        $bands = ShelfItemBand::query()->where('stock_location_id', $location->id)->get()->keyBy('item_id');

        // Stock here per variant, with the CBM of one unit of its packaging.
        $stock = ItemStock::query()
            ->join('item_variants as iv', 'iv.id', '=', 'item_stocks.item_variant_id')
            ->leftJoin('item_variant_packaging_quantity as ivpq', function ($join): void {
                $join->on('ivpq.item_variant_id', '=', 'iv.id')
                    ->on('ivpq.item_packaging_type_id', '=', 'iv.item_packaging_type_id');
            })
            ->where('item_stocks.stock_location_id', $location->id)
            ->where('item_stocks.quantity', '>', 0)
            ->get([
                'iv.item_id',
                'iv.sku',
                'item_stocks.item_variant_id',
                'item_stocks.quantity',
                DB::raw('COALESCE(ivpq.cbm, 0) as unit_cbm'),
            ])
            ->groupBy('item_id');

        $itemIds = $bands->keys()->merge($stock->keys())->map(fn ($id): int => (int) $id)->unique()->values();

        // Floor-plan areas each item sits in here (FloorPlan).
        $areas = FloorArea::query()
            ->where('stock_location_id', $location->id)
            ->with('items:id')
            ->get()
            ->flatMap(fn (FloorArea $area) => $area->items->map(fn ($item): array => ['item_id' => (int) $item->id, 'code' => (string) $area->code]))
            ->groupBy('item_id')
            ->map(fn ($rows) => $rows->pluck('code')->sort()->values()->all());
        $items = Item::query()->with('variants:id,item_id,sku,images')->whereIn('id', $itemIds)->get()->keyBy('id');
        $this->ladder->forItems($itemIds->all());

        return $itemIds
            ->map(fn (int $id): ?array => $items->has($id)
                ? $this->row($items[$id], $bands->get($id), $stock->get($id) ?? collect()) + ['areas' => $areas->get($id, [])]
                : null)
            ->filter()
            // Worst first, so what needs action leads the list.
            ->sortBy(fn (array $row): string => array_search($row['status'], ['critical', 'empty', 'low', 'ok', 'full'], true).$row['name'])
            ->values();
    }

    /**
     * @param  Collection<int, mixed>  $lines
     * @return array<string, mixed>
     */
    private function row(Item $item, ?ShelfItemBand $band, Collection $lines): array
    {
        $itemId = (int) $item->id;
        $tiers = $this->ladder->forItem($itemId);

        $pieces = (int) $lines->sum(fn ($line): int => (int) $line->quantity * $this->ladder->piecesPerUnit((int) $line->item_variant_id));
        $cbm = (float) $lines->sum(fn ($line): float => (int) $line->quantity * (float) $line->unit_cbm);

        // Lines are spoken in the band's pack unit; with no band, the biggest.
        $unit = $band?->item_packaging_type_id !== null
            ? collect($tiers)->firstWhere('id', $band->item_packaging_type_id)
            : null;
        $unit ??= $this->ladder->largestTier($itemId);
        $per = max(1, (int) $unit['pieces']);

        $status = match (true) {
            $pieces <= 0 => 'empty',
            $band !== null && $pieces <= $band->critical_units * $per => 'critical',
            $band !== null && $pieces <= $band->refill_units * $per => 'low',
            $band !== null && $pieces >= $band->max_units * $per => 'full',
            default => 'ok',
        };

        $maxPieces = $band ? $band->max_units * $per : 0;
        $breakdown = $this->ladder->breakdown($pieces, $itemId, $tiers);

        return [
            'item_id' => $itemId,
            'name' => (string) $item->product_name,
            'image' => $this->image($item),
            'skus' => $item->variants->pluck('sku')->filter()->values()->all(),
            'pieces' => $pieces,
            // Biggest packaging first, the headline on every keeper screen.
            'display' => $this->ladder->label($breakdown),
            'lead' => $breakdown[0] ?? null,
            'in_unit' => round($pieces / $per, 1),
            'unit' => ['id' => $unit['id'], 'name' => $unit['name'], 'pieces' => $per],
            'units' => array_map(fn (array $t): array => ['id' => $t['id'], 'name' => $t['name'], 'pieces' => (int) $t['pieces']], $tiers),
            'level' => $band === null ? null : [
                'max' => $band->max_units,
                'low' => $band->refill_units,
                'critical' => $band->critical_units,
            ],
            'fill' => $maxPieces > 0 ? round(min(1, $pieces / $maxPieces), 3) : null,
            'to_full' => $band !== null ? max(0, round(($maxPieces - $pieces) / $per, 1)) : null,
            'cbm' => round($cbm, 3),
            'status' => $status,
            'assigned' => $band !== null,
        ];
    }

    private function image(Item $item): ?string
    {
        $general = is_string($item->general_images) ? json_decode($item->general_images, true) : ($item->general_images ?? []);
        $path = collect((array) $general)->filter()->first();

        if ($path === null) {
            foreach ($item->variants as $variant) {
                $raw = is_string($variant->images) ? json_decode($variant->images, true) : ($variant->images ?? []);
                $path = collect((array) $raw)->filter()->first();
                if ($path !== null) {
                    break;
                }
            }
        }

        return $path ? ImageResolver::resolve((string) $path) : null;
    }

    private function assertServed(StockLocation $location): void
    {
        if (! $this->serves($location)) {
            throw new InvalidArgumentException("{$location->name} has no stock levels here; a Store Shelf uses its own matrix.");
        }
    }
}
