<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Store\Store;

/**
 * Which stockable leaves a location address covers (STOCK_PLAN.md phase 4).
 *
 * Readers and writers across the app still name places the old way — a
 * (location_type, location_id) pair — and screens keep doing so until phase 6.
 * This is the one translation from that vocabulary to the location tree, so a
 * store's total means the same thing on every screen:
 *
 *   Store (retail)          shelf + floor              its sellable total
 *   Store (warehouse type)  its hub
 *   Warehouse               its main hub
 *   ItemInventoryLocation   its shelf or floor leaf
 *   StockLocation           itself if stockable; a store group node → shelf + floor
 *
 * A store's Remote Hub is never part of "the store": it is its own tier.
 *
 * For a write, leafFor() picks the single leaf an address books into; a retail
 * store as a whole books into its floor.
 */
class StockScope
{
    /** @var array<string, array<int>> */
    private array $leafIds = [];

    public function __construct(private readonly StockLocationTree $tree)
    {
    }

    /**
     * Stockable leaves an address covers. Empty when it names nothing.
     *
     * @return array<int>
     */
    public function leafIds(string $locationType, int $locationId): array
    {
        $key = $locationType.'#'.$locationId;

        if (isset($this->leafIds[$key])) {
            return $this->leafIds[$key];
        }

        $node = $locationType === StockLocation::class
            ? StockLocation::query()->find($locationId)
            : StockLocation::query()->legacy($locationType, $locationId)->first();

        if ($node === null) {
            return [];
        }

        return $this->leafIds[$key] = $this->leafIdsForNode($node);
    }

    /** @return array<int> */
    public function leafIdsForNode(StockLocation $node): array
    {
        if ($node->is_stockable) {
            return [(int) $node->id];
        }

        return StockLocation::query()
            ->where('parent_id', $node->id)
            ->whereIn('kind', [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM])
            ->orderBy('id')
            ->pluck('id')
            ->map(fn ($id): int => (int) $id)
            ->all();
    }

    /**
     * Every leaf of one legacy class — "all store-level stock", "all warehouse
     * stock" — for the few readers that filter by type alone.
     *
     * @return array<int>
     */
    public function leafIdsForType(string $locationType): array
    {
        $kinds = match ($locationType) {
            Store::class => [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM],
            Warehouse::class => [StockLocation::KIND_MAIN_HUB, StockLocation::KIND_REMOTE_HUB],
            ItemInventoryLocation::class => [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM],
            default => StockLocation::STOCKABLE_KINDS,
        };

        return StockLocation::query()
            ->whereIn('kind', $kinds)
            ->pluck('id')
            ->map(fn ($id): int => (int) $id)
            ->all();
    }

    /** The one leaf a write to this address books into. */
    public function leafFor(string $locationType, int $locationId): ?StockLocation
    {
        $leafId = $this->tree->leafIdFor($locationType, $locationId);

        if ($leafId === null && $locationType === StockLocation::class) {
            $node = StockLocation::query()->find($locationId);
            $leafId = $node && $node->kind === StockLocation::KIND_STORE
                ? StockLocation::query()->where('parent_id', $node->id)->where('kind', StockLocation::KIND_BACKROOM)->value('id')
                : null;
        }

        return $leafId === null ? null : StockLocation::query()->find($leafId);
    }

    /** @return array<int> the store's shelf + floor */
    public function storeLeafIds(int $storeId): array
    {
        return $this->leafIds(Store::class, $storeId);
    }
}
