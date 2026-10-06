<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Services\Fulfillment\MovementDomainService;
use App\Services\Inventory\ItemStockReader;
use App\Services\Inventory\PackagingLadder;

/**
 * Where a store's stock sits: on the shelf, in the store room, or off-site.
 *
 * The admin stock tool offers three places for a store, and until now only one
 * of them was a record of anything:
 *
 *   Store Shelf      item_stocks at the store's shelf leaf.
 *   Store            item_stocks at the store's floor leaf. Shelf + floor is
 *                    what every reader means by "the store's stock".
 *   Remote Warehouse item_stocks at the store's own Remote Hub, if it has one
 *                    (relabelled "Remote Hub" in STOCK_PLAN phase 6).
 *
 * Previously the browser computed the first two as
 * `Math.round(totalStoreStock * 0.25)` and the remainder, and sat them beside
 * "Warehouse A" and "Warehouse B" pills reading from `warehouse_a_stock` and
 * `warehouse_b_stock` — props no controller in the application has ever sent,
 * so both always showed 0.
 *
 * Quantities are returned in pieces. item_stocks counts packaging units, and
 * a variant's unit is worth `calculateTotalPieces()` of them, so every figure
 * here is multiplied through before it is summed. Mixing the two is what made
 * a carton of twelve and a loose piece count the same.
 */
class StoreLocationStockService
{
    public function __construct(
        private readonly PackagingLadder $ladder,
        private readonly ItemStockReader $reader,
    ) {
    }

    /**
     * Pieces of the given variants on this store's Store Shelf.
     *
     * @param  array<int, int>  $piecesPerUnit  item_variant_id => pieces per unit
     */
    public function shelfPieces(Store $store, array $piecesPerUnit): int
    {
        return $this->piecesAtKind($store, StockLocation::KIND_SHELF, $piecesPerUnit);
    }

    /**
     * Pieces of the given variants on this store's floor ("Store").
     *
     * @param  array<int, int>  $piecesPerUnit  item_variant_id => pieces per unit
     */
    public function floorPieces(Store $store, array $piecesPerUnit): int
    {
        return $this->piecesAtKind($store, StockLocation::KIND_BACKROOM, $piecesPerUnit);
    }

    /**
     * Pieces of the given variants at this store's own Remote Hub — never a
     * shared main hub (warehouses.store_id used to make Hub A read as one).
     *
     * @param  array<int, int>  $piecesPerUnit  item_variant_id => pieces per unit
     */
    public function remoteWarehousePieces(Store $store, array $piecesPerUnit): int
    {
        return $this->piecesAtKind($store, StockLocation::KIND_REMOTE_HUB, $piecesPerUnit);
    }

    /** @param  array<int, int>  $piecesPerUnit */
    private function piecesAtKind(Store $store, string $kind, array $piecesPerUnit): int
    {
        if ($piecesPerUnit === []) {
            return 0;
        }

        $leafIds = StockLocation::query()
            ->where('store_id', $store->id)
            ->where('kind', $kind)
            ->pluck('id');

        if ($leafIds->isEmpty()) {
            return 0;
        }

        return $this->sumPieces(
            ItemStock::query()
                ->whereIn('stock_location_id', $leafIds)
                ->whereIn('item_variant_id', array_keys($piecesPerUnit))
                ->groupBy('item_variant_id')
                ->selectRaw('item_variant_id, SUM(quantity) as quantity')
                ->pluck('quantity', 'item_variant_id')
                ->all(),
            $piecesPerUnit,
        );
    }

    /**
     * The three locations a store reports stock at, ready for the UI.
     *
     * `$storeTotalPieces` is supplied by the caller rather than recomputed
     * here: StockService::getBatchStock() is the one reader that knows to
     * prefer the movements ledger over the positional one, and a second
     * opinion on the same number is how the shelf and the total drifted apart
     * in the first place.
     *
     * Each entry carries both the raw piece figure and the way that place
     * speaks it:
     *
     *   shelf             the smallest unit only — "3,617 Pieces". A floor is
     *                     handled and sold one at a time.
     *   store room        biggest unit first — "30 Cartons · 17 Pieces".
     *   remote warehouse  biggest unit first, for the same reason.
     *
     * $itemId is what makes that possible: the packaging ladder belongs to the
     * item, so without it there is nothing to name the units with. Omit it and
     * the figures still come back, labelled in plain pieces.
     *
     * @param  array<int, int>  $piecesPerUnit  item_variant_id => pieces per unit
     * @return array<int, array<string, mixed>>
     */
    public function locations(Store $store, array $piecesPerUnit, int $storeTotalPieces, ?int $itemId = null): array
    {
        // $storeTotalPieces is shelf + floor (StockService::getBatchStock), so
        // total − shelf is exactly the floor — and the pair always adds back
        // up to the figure the caller shows as the store's stock.
        $shelf = min($storeTotalPieces, $this->shelfPieces($store, $piecesPerUnit));

        $rows = [
            [
                'key' => 'shelf',
                'label' => 'Store Shelf',
                'stock' => $shelf,
                'derived' => false,
                'kind' => MovementDomainService::NODE_SHELF,
            ],
            [
                'key' => 'store_room',
                'label' => 'Store Floor',
                'stock' => max(0, $storeTotalPieces - $shelf),
                'derived' => true,
                'kind' => MovementDomainService::NODE_BACKROOM,
            ],
            [
                'key' => 'remote_warehouse',
                'label' => 'Remote Hub',
                'stock' => $this->remoteWarehousePieces($store, $piecesPerUnit),
                'derived' => false,
                'kind' => MovementDomainService::NODE_REMOTE_WAREHOUSE,
            ],
        ];

        return array_map(function (array $row) use ($itemId): array {
            $mode = $this->reader->displayModeFor($row['kind']);

            if ($itemId === null) {
                return $row + [
                    'display' => number_format($row['stock']) . ' pcs',
                    'units' => [],
                    'display_mode' => $mode,
                ];
            }

            $units = $this->ladder->units($row['stock'], $itemId, $mode);

            return $row + [
                'display' => $this->ladder->label($units),
                'units' => $units,
                'display_mode' => $mode,
            ];
        }, $rows);
    }

    /**
     * @param  array<int, int|string>  $quantityByVariant
     * @param  array<int, int>  $piecesPerUnit
     */
    private function sumPieces(array $quantityByVariant, array $piecesPerUnit): int
    {
        $total = 0;

        foreach ($quantityByVariant as $variantId => $quantity) {
            $total += (int) $quantity * max(1, $piecesPerUnit[$variantId] ?? 1);
        }

        return $total;
    }
}
