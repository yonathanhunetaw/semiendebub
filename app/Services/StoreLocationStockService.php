<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;

/**
 * Where a store's stock sits: on the shelf, in the store room, or off-site.
 *
 * The admin stock tool offers three places for a store, and until now only one
 * of them was a record of anything:
 *
 *   Store Shelf      item_stocks at an item_inventory_locations row of kind
 *                    `shelf` belonging to this store.
 *   Store Room       the store's own total, minus the shelf. Derived rather
 *                    than stored, so the pair always adds back up to the
 *                    figure every other reader means by "the store's stock".
 *   Remote Warehouse item_stocks at the Warehouse joined to the store by
 *                    Store::warehouse().
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
    /**
     * Pieces of the given variants sitting on this store's shelves.
     *
     * @param  array<int, int>  $piecesPerUnit  item_variant_id => pieces per unit
     */
    public function shelfPieces(Store $store, array $piecesPerUnit): int
    {
        if ($piecesPerUnit === []) {
            return 0;
        }

        $shelfIds = ItemInventoryLocation::query()
            ->where('store_id', $store->id)
            ->shelves()
            ->pluck('id');

        if ($shelfIds->isEmpty()) {
            return 0;
        }

        return $this->sumPieces(
            ItemStock::query()
                ->where('location_type', ItemInventoryLocation::class)
                ->whereIn('location_id', $shelfIds)
                ->whereIn('item_variant_id', array_keys($piecesPerUnit))
                ->pluck('quantity', 'item_variant_id')
                ->all(),
            $piecesPerUnit,
        );
    }

    /**
     * Pieces of the given variants held at this store's remote warehouse.
     *
     * @param  array<int, int>  $piecesPerUnit  item_variant_id => pieces per unit
     */
    public function remoteWarehousePieces(Store $store, array $piecesPerUnit): int
    {
        $warehouse = $store->warehouse;

        if (! $warehouse || $piecesPerUnit === []) {
            return 0;
        }

        return $this->sumPieces(
            ItemStock::query()
                ->where('location_type', Warehouse::class)
                ->where('location_id', $warehouse->id)
                ->whereIn('item_variant_id', array_keys($piecesPerUnit))
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
     * @param  array<int, int>  $piecesPerUnit  item_variant_id => pieces per unit
     * @return array<int, array{key: string, label: string, stock: int, derived: bool}>
     */
    public function locations(Store $store, array $piecesPerUnit, int $storeTotalPieces): array
    {
        $shelf = min($storeTotalPieces, $this->shelfPieces($store, $piecesPerUnit));

        return [
            [
                'key' => 'shelf',
                'label' => 'Store Shelf',
                'stock' => $shelf,
                'derived' => false,
            ],
            [
                'key' => 'store_room',
                'label' => 'Store Room',
                // The remainder, so shelf + room is always the store's total.
                'stock' => max(0, $storeTotalPieces - $shelf),
                'derived' => true,
            ],
            [
                'key' => 'remote_warehouse',
                'label' => 'Remote Warehouse',
                'stock' => $this->remoteWarehousePieces($store, $piecesPerUnit),
                'derived' => false,
            ],
        ];
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
