<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Auth\User;
use App\Models\Inventory\Warehouse;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Warehouse-desk read/write model.
 *
 * The stock ledger (`item_stocks`) is polymorphic: a row lives either in a
 * Warehouse or in a Store. Everything the StockKeeper module shows is derived
 * from that one table, so location handling is centralised here rather than
 * repeated across controllers.
 */
class StockKeeperService
{
    public const WAREHOUSE_TYPE = Warehouse::class;

    public const STORE_TYPE = Store::class;

    /**
     * Headline counters for the StockKeeper dashboard.
     *
     * @return array<string, int>
     */
    public function metrics(): array
    {
        $base = ItemStock::query();

        return [
            'tracked_skus' => (int) (clone $base)->distinct('item_variant_id')->count('item_variant_id'),
            'units_on_hand' => (int) (clone $base)->sum('quantity'),
            'stock_rows' => (int) (clone $base)->count(),
            'low_stock' => (int) $this->lowStockQuery()->count(),
            'out_of_stock' => (int) (clone $base)->where('quantity', '<=', 0)->count(),
            'warehouse_units' => (int) (clone $base)->where('location_type', self::WAREHOUSE_TYPE)->sum('quantity'),
            'store_units' => (int) (clone $base)->where('location_type', self::STORE_TYPE)->sum('quantity'),
            'warehouses' => Warehouse::query()->count(),
        ];
    }

    /**
     * Stock rows at or below their configured minimum.
     *
     * `min_stock_level` is the threshold the warehouse desk maintains; a row is
     * only an alert once it actually breaches it.
     *
     * @return Builder<ItemStock>
     */
    public function lowStockQuery(): Builder
    {
        return ItemStock::query()
            ->whereColumn('quantity', '<=', 'min_stock_level')
            ->where('min_stock_level', '>', 0);
    }

    /**
     * Paginated alert feed, most urgent first.
     *
     * @return LengthAwarePaginator<int, ItemStock>
     */
    public function paginateAlerts(
        ?string $search = null,
        ?string $severity = null,
        ?int $perPage = null
    ): LengthAwarePaginator {
        $query = $this->lowStockQuery()
            ->with(['itemVariant.item', 'itemVariant.itemColor', 'itemVariant.itemSize']);

        if ($severity === 'out_of_stock') {
            $query->where('quantity', '<=', 0);
        } elseif ($severity === 'low_stock') {
            $query->where('quantity', '>', 0);
        }

        $this->applyVariantSearch($query, $search);

        return $query
            // Deepest breach first: most negative headroom is most urgent.
            ->orderByRaw('(quantity - min_stock_level) ASC')
            ->orderBy('quantity')
            ->paginate($perPage ?? 25)
            ->withQueryString();
    }

    /**
     * Paginated stock ledger for the inventory screen.
     *
     * @return LengthAwarePaginator<int, ItemStock>
     */
    public function paginateStock(
        ?string $search = null,
        ?string $locationType = null,
        ?int $locationId = null,
        ?int $perPage = null
    ): LengthAwarePaginator {
        $query = ItemStock::query()
            ->with(['itemVariant.item', 'itemVariant.itemColor', 'itemVariant.itemSize']);

        if ($locationType !== null) {
            $query->where('location_type', $locationType);
        }

        if ($locationId !== null) {
            $query->where('location_id', $locationId);
        }

        $this->applyVariantSearch($query, $search);

        return $query
            ->orderByDesc('quantity')
            ->paginate($perPage ?? 25)
            ->withQueryString();
    }

    /**
     * Every place stock can sit, as one flat pick list.
     *
     * @return array<int, array{id: int, name: string, type: string, kind: string, units: int}>
     */
    public function locations(): array
    {
        $totals = ItemStock::query()
            ->selectRaw('location_type, location_id, SUM(quantity) as units')
            ->groupBy('location_type', 'location_id')
            ->get()
            ->keyBy(fn ($row) => $row->location_type . '#' . $row->location_id);

        $warehouses = Warehouse::query()->orderBy('name')->get()->map(fn (Warehouse $warehouse) => [
            'id' => (int) $warehouse->id,
            'name' => (string) $warehouse->name,
            'type' => self::WAREHOUSE_TYPE,
            'kind' => 'warehouse',
            'units' => (int) ($totals[self::WAREHOUSE_TYPE . '#' . $warehouse->id]->units ?? 0),
        ]);

        $stores = Store::query()->orderBy('name')->get()->map(fn (Store $store) => [
            'id' => (int) $store->id,
            'name' => (string) $store->name,
            'type' => self::STORE_TYPE,
            'kind' => 'store',
            'units' => (int) ($totals[self::STORE_TYPE . '#' . $store->id]->units ?? 0),
        ]);

        return $warehouses->concat($stores)->values()->all();
    }

    /**
     * Where this stock keeper is posted, when their account names a location.
     */
    public function assignedLocation(?User $user): ?array
    {
        if (! $user || ! $user->inventory_location_id) {
            return null;
        }

        $location = \App\Models\StockKeeper\ItemInventoryLocation::find($user->inventory_location_id);

        return $location ? [
            'id' => (int) $location->id,
            'name' => (string) $location->name,
        ] : null;
    }

    /**
     * Shape a ledger row for the UI.
     *
     * @return array<string, mixed>
     */
    public function presentStockRow(ItemStock $stock): array
    {
        $variant = $stock->itemVariant;
        $quantity = (int) $stock->quantity;
        $minimum = (int) $stock->min_stock_level;

        return [
            'id' => (int) $stock->id,
            'variant_id' => (int) $stock->item_variant_id,
            'product_name' => (string) ($variant?->item?->product_name ?? 'Unknown product'),
            'sku' => $variant?->sku,
            'variant_label' => $this->variantLabel($variant),
            'location_name' => $this->locationName($stock),
            'location_kind' => $stock->location_type === self::WAREHOUSE_TYPE ? 'warehouse' : 'store',
            'quantity' => $quantity,
            'min_stock_level' => $minimum,
            // Negative headroom is how far past the threshold a row has fallen.
            'headroom' => $quantity - $minimum,
            'status' => $this->stockStatus($quantity, $minimum),
            'updated_at' => $stock->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return 'out_of_stock'|'critical'|'low_stock'|'healthy'
     */
    public function stockStatus(int $quantity, int $minimum): string
    {
        if ($quantity <= 0) {
            return 'out_of_stock';
        }

        if ($minimum > 0 && $quantity <= $minimum) {
            // Half the threshold or less is treated as critical, not merely low.
            return $quantity <= (int) floor($minimum / 2) ? 'critical' : 'low_stock';
        }

        return 'healthy';
    }

    /**
     * Book stock into a location, creating the ledger row on first receipt.
     */
    public function receive(int $variantId, string $locationType, int $locationId, int $quantity, ?int $minStockLevel = null): ItemStock
    {
        $stock = ItemStock::firstOrCreate(
            [
                'item_variant_id' => $variantId,
                'location_type' => $locationType,
                'location_id' => $locationId,
            ],
            [
                'quantity' => 0,
                'min_stock_level' => $minStockLevel ?? 0,
            ],
        );

        $stock->increment('quantity', $quantity);

        if ($minStockLevel !== null) {
            $stock->update(['min_stock_level' => $minStockLevel]);
        }

        return $stock->refresh();
    }

    /**
     * Correct a count after a physical recount. Returns the signed delta.
     */
    public function adjust(ItemStock $stock, int $countedQuantity, ?int $minStockLevel = null): int
    {
        $delta = $countedQuantity - (int) $stock->quantity;

        $stock->update(array_filter([
            'quantity' => $countedQuantity,
            'min_stock_level' => $minStockLevel,
        ], fn ($value) => $value !== null));

        return $delta;
    }

    /**
     * Human-readable location label for a ledger row.
     */
    public function locationName(ItemStock $stock): string
    {
        $resolved = $stock->location_type === self::WAREHOUSE_TYPE
            ? Warehouse::find($stock->location_id)?->name
            : Store::find($stock->location_id)?->name;

        return (string) ($resolved ?? 'Unassigned location');
    }

    /**
     * Variants a stock keeper can book in, as a searchable pick list.
     *
     * @return Collection<int, array{id: int, label: string, sku: string|null}>
     */
    public function variantOptions(?string $search = null, int $limit = 50): Collection
    {
        $query = ItemVariant::query()->with(['item', 'itemColor', 'itemSize']);

        if ($search !== null && $search !== '') {
            $term = '%' . $search . '%';
            $query->where(fn (Builder $q) => $q
                ->where('sku', 'LIKE', $term)
                ->orWhereHas('item', fn (Builder $iq) => $iq->where('product_name', 'LIKE', $term)));
        }

        return $query
            ->limit($limit)
            ->get()
            ->map(fn (ItemVariant $variant) => [
                'id' => (int) $variant->id,
                'label' => ($variant->item?->product_name ?? 'Unknown')
                    . ' — ' . $this->variantLabel($variant),
                'sku' => $variant->sku,
            ])
            ->values();
    }

    /**
     * @param  Builder<ItemStock>  $query
     */
    private function applyVariantSearch(Builder $query, ?string $search): void
    {
        if ($search === null || $search === '') {
            return;
        }

        $term = '%' . $search . '%';

        $query->whereHas('itemVariant', fn (Builder $vq) => $vq
            ->where('sku', 'LIKE', $term)
            ->orWhere('barcode', 'LIKE', $term)
            ->orWhereHas('item', fn (Builder $iq) => $iq->where('product_name', 'LIKE', $term)));
    }

    private function variantLabel(?ItemVariant $variant): string
    {
        if (! $variant) {
            return 'Standard';
        }

        $parts = array_filter([
            $variant->itemColor?->name,
            $variant->itemSize?->name,
        ]);

        return $parts === [] ? 'Standard' : implode(' / ', $parts);
    }
}
