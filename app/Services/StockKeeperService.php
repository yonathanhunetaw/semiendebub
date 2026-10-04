<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Services\Inventory\ItemStockReader;
use App\Services\Inventory\PackagingLadder;
use App\Services\Inventory\StockKeeperVisibility;
use App\Services\Inventory\StockScope;
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

    public function __construct(
        private ItemStockReader $reader,
        private readonly PackagingLadder $ladder,
        private readonly StockScope $scope,
        private readonly StockService $ledger,
    ) {
    }

    /**
     * Location names keyed by "{type}#{id}", memoized for the request.
     *
     * @var array<string, string>|null
     */
    private ?array $locationNameCache = null;

    /** Leaf / node ids this view is limited to; null = unrestricted. @var array<int>|null */
    private ?array $onlyLeafIds = null;

    /** @var array<int>|null */
    private ?array $onlyNodeIds = null;

    /**
     * This service as one stock keeper sees it: the ledger, alerts, metrics and
     * location lists are limited to what StockKeeperVisibility allows them.
     */
    public function forUser(?User $user): static
    {
        $scope = app(StockKeeperVisibility::class)->scopeFor($user);

        $copy = clone $this;
        $copy->onlyLeafIds = $scope['leaves'] ?? null;
        $copy->onlyNodeIds = $scope['nodes'] ?? null;
        $copy->reader = $this->reader->restrictedTo($copy->onlyLeafIds);

        return $copy;
    }

    /**
     * Limit any ItemStock query to the locations this view may see.
     *
     * @template TQuery of Builder
     *
     * @param  TQuery  $query
     * @return TQuery
     */
    public function visibleOnly(Builder $query): Builder
    {
        return $this->onlyLeafIds === null ? $query : $query->whereIn('stock_location_id', $this->onlyLeafIds);
    }

    /** May this user book stock into, or recount, the leaf behind this address? Unknown addresses fall through to the usual error. */
    public function mayOperateAddress(?User $user, string $locationType, int $locationId): bool
    {
        $leaf = $this->scope->leafFor($locationType, $locationId);

        return $leaf === null || app(StockKeeperVisibility::class)->mayOperate($user, $leaf);
    }

    public function mayOperateRow(?User $user, ItemStock $stock): bool
    {
        $leaf = $stock->stockLocation;

        return $leaf === null || app(StockKeeperVisibility::class)->mayOperate($user, $leaf);
    }

    /**
     * Headline counters for the StockKeeper dashboard.
     *
     * @return array<string, int>
     */
    public function metrics(?string $locationType = null, ?int $locationId = null): array
    {
        // Delivery's custody is not stock on a shelf; an emptied custody row
        // must not read as an out-of-stock line.
        $base = $this->visibleOnly(ItemStock::query()->whereNotIn('stock_location_id', StockLocation::query()->where('kind', StockLocation::KIND_TRANSIT)->select('id')));

        /*
         * Items lead.
         *
         * This used to headline `tracked_skus`, a distinct count of
         * item_variant_id — so a desk holding 182 products reported "1,629
         * variants", a figure about how the catalogue is cut rather than about
         * what is on the floor. Variants are still reported, below the items.
         */
        $itemMetrics = $this->reader->metrics($locationType, $locationId);

        return [
            'items' => $itemMetrics['items'],
            'variants' => $itemMetrics['variants'],
            // Kept so older screens keep rendering; prefer `variants`.
            'tracked_skus' => $itemMetrics['variants'],
            'ledger_rows' => $itemMetrics['ledger_rows'],
            'stock_rows' => $itemMetrics['ledger_rows'],
            // Raw ledger sum, in mixed packaging units — not comparable across
            // variants. `pieces_on_hand` is the figure that is.
            'units_on_hand' => $itemMetrics['units_on_hand'],
            'pieces_on_hand' => $itemMetrics['pieces_on_hand'],
            'low_stock' => (int) $this->lowStockQuery()->count(),
            'low_stock_items' => $itemMetrics['low_stock_items'],
            'out_of_stock' => (int) (clone $base)->where('quantity', '<=', 0)->count(),
            'out_of_stock_items' => $itemMetrics['out_of_stock_items'],
            'warehouse_units' => (int) (clone $base)->whereIn('stock_location_id', $this->scope->leafIdsForType(self::WAREHOUSE_TYPE))->sum('quantity'),
            'store_units' => (int) (clone $base)->whereIn('stock_location_id', $this->scope->leafIdsForType(self::STORE_TYPE))->sum('quantity'),
            'warehouses' => Warehouse::query()->count(),
        ];
    }

    /**
     * The ledger as the floor reads it: one row per item, in that location's
     * own units.
     *
     * @return array{rows: array<int, array<string, mixed>>, total_items: int, page: int, last_page: int}
     */
    public function paginateItems(
        ?string $search = null,
        ?string $locationType = null,
        ?int $locationId = null,
        int $page = 1,
        int $perPage = 25,
    ): array {
        return $this->reader->paginateItems($locationType, $locationId, $search, $page, $perPage);
    }

    /**
     * The variant rows behind one item, which is what a receive or a recount is
     * actually written against.
     *
     * @return array<int, array<string, mixed>>
     */
    public function variantsForItem(int $itemId, ?string $locationType = null, ?int $locationId = null): array
    {
        return $this->reader->variantsForItem($itemId, $locationType, $locationId);
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
        return $this->visibleOnly(ItemStock::query())
            ->whereNotIn('stock_location_id', StockLocation::query()->where('kind', StockLocation::KIND_TRANSIT)->select('id'))
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
        $query = $this->visibleOnly(ItemStock::query())
            ->with(['itemVariant.item', 'itemVariant.itemColor', 'itemVariant.itemSize'])
            // Goods in a courier's hands are Delivery's, not a shelf to count.
            ->whereNotIn('stock_location_id', StockLocation::query()->where('kind', StockLocation::KIND_TRANSIT)->select('id'));

        if ($locationType !== null) {
            $query->whereIn('stock_location_id', $locationId !== null
                ? $this->scope->leafIds($locationType, $locationId)
                : $this->scope->leafIdsForType($locationType));
        }

        $this->applyVariantSearch($query, $search);

        return $query
            ->orderByDesc('quantity')
            ->paginate($perPage ?? 25)
            ->withQueryString();
    }

    /**
     * Every place stock can sit, as one flat pick list, from the one location
     * tree (STOCK_PLAN.md §2.1): each store as a whole, its Store Shelf and
     * Store (floor), its Remote Hub if it has one, and the shared main hubs.
     *
     * Addressed as (StockLocation, id) pairs, which every reader and writer
     * resolves through StockScope — a store node means its shelf + floor.
     * `units` is the raw ledger sum in mixed packaging units, as before.
     *
     * @return array<int, array{id: int, name: string, type: string, kind: string, units: int, store_id: int|null}>
     */
    public function locations(): array
    {
        $units = ItemStock::query()
            ->whereNotNull('stock_location_id')
            ->selectRaw('stock_location_id, SUM(quantity) as units')
            ->groupBy('stock_location_id')
            ->pluck('units', 'stock_location_id')
            ->map(fn ($n): int => (int) $n);

        // "In Delivery" is the courier's custody, never a place to pick.
        $nodes = StockLocation::query()->with('store')->where('kind', '!=', StockLocation::KIND_TRANSIT)
            ->when($this->onlyNodeIds !== null, fn ($q) => $q->whereIn('id', $this->onlyNodeIds))
            ->get();
        $order = [
            StockLocation::KIND_MAIN_HUB => 0,
            StockLocation::KIND_STORE => 1,
            StockLocation::KIND_SHELF => 2,
            StockLocation::KIND_BACKROOM => 3,
            StockLocation::KIND_REMOTE_HUB => 4,
        ];

        return $nodes
            ->sortBy(fn (StockLocation $node): string => sprintf(
                '%d-%s-%d-%s',
                $node->kind === StockLocation::KIND_MAIN_HUB ? 0 : 1,
                $node->store?->name ?? '',
                $order[$node->kind] ?? 9,
                $node->name,
            ))
            ->map(fn (StockLocation $node): array => [
                'id' => (int) $node->id,
                'name' => $node->store_id !== null && $node->kind !== StockLocation::KIND_STORE && $node->kind !== StockLocation::KIND_REMOTE_HUB
                    ? ($node->store?->name ?? '').' — '.$node->name
                    : $node->name,
                'type' => StockLocation::class,
                'kind' => (string) $node->kind,
                'units' => $node->is_stockable
                    ? (int) ($units[$node->id] ?? 0)
                    : (int) collect($this->scope->leafIdsForNode($node))->sum(fn (int $id): int => (int) ($units[$id] ?? 0)),
                'store_id' => $node->store_id !== null ? (int) $node->store_id : null,
            ])
            ->values()
            ->all();
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

        // The unit the row is counted in. A bare "11" was read as 11 pieces on
        // every screen; against a carton variant it is 11 × 120.
        $unit = (string) ($variant?->itemPackagingType?->name ?? 'Piece');
        $piecesPerUnit = $variant !== null ? $this->ladder->piecesPerUnit((int) $variant->id) : 1;

        return [
            'id' => (int) $stock->id,
            'variant_id' => (int) $stock->item_variant_id,
            'item_id' => (int) ($variant?->item_id ?? 0),
            'product_name' => (string) ($variant?->item?->product_name ?? 'Unknown product'),
            'sku' => $variant?->sku,
            'variant_label' => $this->variantLabel($variant),
            'unit' => $unit,
            'pieces_per_unit' => $piecesPerUnit,
            'pieces' => $quantity * $piecesPerUnit,
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
     * Book stock into a location through the ledger gateway: locked and
     * journalled. A store as a whole books onto its floor.
     */
    public function receive(int $variantId, string $locationType, int $locationId, int $quantity, ?int $minStockLevel = null): ItemStock
    {
        $leaf = $this->scope->leafFor($locationType, $locationId)
            ?? throw new \InvalidArgumentException('That location cannot hold stock.');

        $stock = $this->ledger->receive($variantId, $leaf, $quantity, ['reason' => 'Received by stock keeper']);

        if ($minStockLevel !== null) {
            $stock->update(['min_stock_level' => $minStockLevel]);
        }

        return $stock->refresh();
    }

    /**
     * Correct a count after a physical recount. Returns the signed delta.
     *
     * The difference goes through the gateway as an adjustment, so the recount
     * is journalled with who made it.
     */
    public function adjust(ItemStock $stock, int $countedQuantity, ?int $minStockLevel = null): int
    {
        if ($stock->stockLocation?->isTransit()) {
            throw new \App\Exceptions\MovementDomainException(
                'Goods In Delivery are counted by the hand-offs, not by a recount.',
                \App\Services\Fulfillment\MovementDomainService::DOMAIN_TRANSFER,
            );
        }

        $delta = $countedQuantity - (int) $stock->quantity;

        if ($delta !== 0 && $stock->stock_location_id !== null) {
            $this->ledger->adjust((int) $stock->item_variant_id, (int) $stock->stock_location_id, $delta, ['reason' => 'Recount']);
        }

        if ($minStockLevel !== null) {
            $stock->update(['min_stock_level' => $minStockLevel]);
        }

        return $delta;
    }

    /**
     * Human-readable location label for a ledger row.
     *
     * Names are resolved from a memoized map rather than per row: this is
     * called once per ledger row while presenting a page, so a find() here
     * cost one query per row (25 rows => 25 queries).
     */
    public function locationName(ItemStock $stock): string
    {
        $names = $this->locationNames();
        $key = $stock->location_type . '#' . $stock->location_id;

        return $names[$key] ?? 'Unassigned location';
    }

    /**
     * Every location name, keyed by "{type}#{id}", loaded at most once per
     * request. Two queries total regardless of how many rows are rendered.
     *
     * @return array<string, string>
     */
    private function locationNames(): array
    {
        if ($this->locationNameCache !== null) {
            return $this->locationNameCache;
        }

        $names = [];

        foreach (Warehouse::query()->pluck('name', 'id') as $id => $name) {
            $names[self::WAREHOUSE_TYPE . '#' . $id] = (string) $name;
        }

        foreach (Store::query()->pluck('name', 'id') as $id => $name) {
            $names[self::STORE_TYPE . '#' . $id] = (string) $name;
        }

        return $this->locationNameCache = $names;
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
