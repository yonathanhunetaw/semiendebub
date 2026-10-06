<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Inventory\StockLocation;
use App\Models\Store\StoreVariantCapacity;

/**
 * The five places a seller's stock can sit, as the More hub and the location
 * pages show them: Store Shelf, Store, Remote Hub, Main Distribution Hub A and B.
 *
 * Locations come from the one `stock_locations` tree (STOCK_PLAN.md §2.1).
 * Quantities are still read through the (location_type, location_id) pair the
 * ledger rows carry until the STOCK_PLAN phase-4 reader cutover. That is the
 * only coupling, and it is confined to ledgerPair().
 *
 * "Store" is the store floor — the `backroom` leaf. There is no store room:
 * a store's stock is on its shelf or on its floor.
 */
class SellerLocationBoard
{
    /** How many shelf lines the replenishment row shows. */
    public const SHELF_ROW_SIZE = 10;

    public function __construct(
        private readonly ItemStockReader $reader,
        private readonly LocationCapacityService $capacity,
        private readonly StockLocationTree $tree,
    ) {
    }

    /**
     * One tile per tier, in ladder order. A tier the store does not have (only
     * Main Store has a Remote Hub) comes back with a null id.
     *
     * @return array<int, array{key: string, label: string, caption: string, icon: string, location_id: int|null, alert: int, pieces: int}>
     */
    public function strip(?int $storeId): array
    {
        $own = $storeId
            ? StockLocation::query()->where('store_id', $storeId)->get()->keyBy('kind')
            : collect();

        $hubs = StockLocation::query()
            ->ofKind(StockLocation::KIND_MAIN_HUB)
            ->orderBy('name')
            ->limit(2)
            ->get()
            ->values();

        $shelf = $own->get(StockLocation::KIND_SHELF);

        $tiles = [
            $this->tile('shelf', 'Store Shelf', 'Active display', 'shelves', $shelf, $shelf ? $this->belowFloorCount($shelf) : 0),
            $this->tile('store', 'Store Floor', 'Store floor', 'storefront', $own->get(StockLocation::KIND_BACKROOM)),
            $this->tile('remote_hub', 'Remote Hub', 'Overflow depot', 'warehouse', $own->get(StockLocation::KIND_REMOTE_HUB)),
        ];

        foreach (['A', 'B'] as $index => $letter) {
            $tiles[] = $this->tile("hub_{$letter}", "Main Hub {$letter}", 'Distribution', 'hub', $hubs->get($index));
        }

        return $tiles;
    }

    /**
     * Whether a seller of this store may open a location: its own nodes, and
     * the shared main hubs.
     */
    public function visibleTo(StockLocation $location, ?int $storeId): bool
    {
        if ($location->kind === StockLocation::KIND_MAIN_HUB) {
            return true;
        }

        return $storeId !== null && (int) $location->store_id === $storeId;
    }

    /**
     * Items held at a location, in the units that place is spoken in.
     *
     * @return array<int, array<string, mixed>>
     */
    public function stock(StockLocation $location): array
    {
        $pair = $this->ledgerPair($location);

        if ($pair === null) {
            return [];
        }

        return $this->reader->paginateItems($pair[0], $pair[1], null, 1, 200)['rows'];
    }

    /**
     * The shelf's replenishment lines: every variant with a band on this shelf,
     * most urgent first. Figures are in the variant's own unit, the same unit
     * the band is set in.
     *
     * @return array<int, array<string, mixed>>
     */
    public function shelfLines(StockLocation $shelf): array
    {
        $pair = $this->ledgerPair($shelf);

        if ($pair === null) {
            return [];
        }

        $bands = StoreVariantCapacity::query()
            ->where('location_type', $pair[0])
            ->where('location_id', $pair[1])
            ->with([
                'storeVariant.item',
                'storeVariant.itemVariant.item',
                'storeVariant.itemVariant.itemColor',
                'storeVariant.itemVariant.itemSize',
                'storeVariant.itemVariant.itemPackagingType',
            ])
            ->get();

        $onHand = $this->capacity->onHandBatch($bands->map(fn (StoreVariantCapacity $band): array => [
            'item_variant_id' => (int) $band->item_variant_id,
            'location_type' => $pair[0],
            'location_id' => $pair[1],
        ])->all());

        return $bands->map(function (StoreVariantCapacity $band) use ($onHand, $pair): array {
            $have = $onHand[$band->item_variant_id . '|' . $pair[0] . '|' . $pair[1]] ?? 0;
            $min = (int) $band->min_capacity;
            $max = max(1, (int) $band->max_capacity);
            $variant = $band->storeVariant?->itemVariant;

            $label = collect([$variant?->itemColor?->name, $variant?->itemSize?->name])->filter()->join(' / ');

            return [
                'id' => (int) $band->id,
                'name' => (string) ($variant?->item?->product_name
                    ?? $band->storeVariant?->item?->product_name
                    ?? 'Unnamed product'),
                'variant' => $label !== '' ? $label : 'Standard',
                'unit' => (string) ($variant?->itemPackagingType?->name ?? 'Piece'),
                'on_hand' => $have,
                'min' => $min,
                'max' => $max,
                'fill' => round(min(1, $have / $max), 3),
                'refill' => max(0, $max - $have),
                'status' => $have <= 0 ? 'empty' : ($have <= $min ? 'refill' : 'ok'),
            ];
        })
            ->sortBy([['fill', 'asc'], ['name', 'asc']])
            ->values()
            ->all();
    }

    /** @return array{key: string, label: string, caption: string, icon: string, location_id: int|null, alert: int, pieces: int} */
    private function tile(string $key, string $label, string $caption, string $icon, ?StockLocation $location, int $alert = 0): array
    {
        $pair = $location ? $this->ledgerPair($location) : null;

        return [
            'key' => $key,
            'label' => $label,
            'caption' => $location ? $caption : 'None',
            'icon' => $icon,
            'location_id' => $location?->id,
            'alert' => $alert,
            // Smallest-unit total: the one figure that adds up across variants.
            'pieces' => $pair ? $this->reader->metrics($pair[0], $pair[1])['pieces_on_hand'] : 0,
        ];
    }

    private function belowFloorCount(StockLocation $shelf): int
    {
        return count(array_filter(
            $this->shelfLines($shelf),
            fn (array $line): bool => $line['status'] !== 'ok',
        ));
    }

    /**
     * The (location_type, location_id) pair this location's ledger rows carry
     * today — for a store floor that is the Store row, not its legacy
     * back-room row. A store group node reads as the store as a whole.
     *
     * @return array{0: string, 1: int}|null
     */
    private function ledgerPair(StockLocation $location): ?array
    {
        if (! $location->is_stockable) {
            return $location->legacy_type && $location->legacy_id
                ? [(string) $location->legacy_type, (int) $location->legacy_id]
                : null;
        }

        return $this->tree->legacyAddressFor($location);
    }
}
