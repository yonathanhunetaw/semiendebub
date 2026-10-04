<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Store\Store;
use App\Services\Fulfillment\MovementDomainService;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * `item_stocks` read as the business reads it: by item, in real units.
 *
 * This is the single answer to "how much of this do we have, and where". Three
 * decisions are settled here so no screen has to make them again:
 *
 *   1. `item_stocks` is the ledger of record. Stock is booked against an
 *      item_variant at a location — before a StoreVariant exists, and whether or
 *      not one ever does. `inventory_movements` is an audit journal (who, why,
 *      when) and `store_variants.stock` is a legacy column; neither is summed
 *      for availability. See StockService::getBatchStock().
 *
 *   2. Items lead, variants follow. A warehouse holding 1,629 ledger rows holds
 *      182 *items*; reporting the row count made the stock desk read "1,880
 *      variants" where the floor thinks in products. Variant detail is still
 *      available per item, but it is never the headline.
 *
 *   3. Quantities are spoken in the item's own packaging ladder, and which way
 *      round depends on the place:
 *
 *        shop shelf                 smallest unit  "3,617 Pieces"
 *        back room, store total     biggest first  "30 Cartons · 17 Pieces"
 *        remote / main warehouse    biggest first  "30 Cartons · 17 Pieces"
 *
 *      A shelf is handled one piece at a time, so a carton figure tells the
 *      floor nothing; a warehouse is moved by the pallet, so a piece figure
 *      tells the dock nothing.
 */
class ItemStockReader
{
    /** Leaf ids every query is limited to; null = unrestricted. @var array<int>|null */
    private ?array $onlyLeafIds = null;

    public function __construct(
        private readonly PackagingLadder $ladder,
        private readonly MovementDomainService $domain,
        private readonly StockScope $scope,
    ) {
    }

    /**
     * A copy of this reader that only ever sees the given leaf locations —
     * a stock keeper's view of the ledger. Null lifts the restriction.
     *
     * @param  array<int>|null  $leafIds
     */
    public function restrictedTo(?array $leafIds): static
    {
        $copy = clone $this;
        $copy->onlyLeafIds = $leafIds;

        return $copy;
    }

    /*
    |--------------------------------------------------------------------------
    | Display rule
    |--------------------------------------------------------------------------
    */

    /**
     * Which way a location's quantities are spoken.
     *
     * One rule, in one place, so the shelf figure on the admin stock tool and
     * the shelf figure on the stock keeper's ledger cannot disagree.
     */
    public function displayModeFor(string $nodeKind): string
    {
        return $nodeKind === MovementDomainService::NODE_SHELF
            ? PackagingLadder::DISPLAY_SMALLEST
            : PackagingLadder::DISPLAY_BREAKDOWN;
    }

    /** The display mode for a (location_type, location_id) pair. */
    public function displayModeForLocation(string $locationType, int $locationId): string
    {
        return $this->displayModeFor($this->domain->nodeKindFor($locationType, $locationId));
    }

    /**
     * Shape a piece total for display at a location.
     *
     * @return array{pieces: int, units: array<int, array{unit: string, count: int, pieces: int}>, label: string, mode: string}
     */
    public function present(int $pieces, int $itemId, string $mode): array
    {
        return $this->ladder->present($pieces, $itemId, $mode);
    }

    /*
    |--------------------------------------------------------------------------
    | Counters
    |--------------------------------------------------------------------------
    */

    /**
     * Headline figures, items first.
     *
     * @return array<string, int>
     */
    public function metrics(?string $locationType = null, ?int $locationId = null): array
    {
        $scoped = fn (): Builder => $this->baseQuery($locationType, $locationId);

        $totals = $scoped()
            ->selectRaw('COUNT(DISTINCT iv.item_id) as items')
            ->selectRaw('COUNT(DISTINCT iv.id) as variants')
            ->selectRaw('COUNT(*) as rows_total')
            ->selectRaw('COALESCE(SUM(s.quantity), 0) as units')
            ->selectRaw('COALESCE(SUM(s.quantity * ' . $this->piecesExpression() . '), 0) as pieces')
            ->first();

        return [
            // What the floor counts in.
            'items' => (int) ($totals->items ?? 0),
            // Kept, but never the headline: see the class docblock.
            'variants' => (int) ($totals->variants ?? 0),
            'ledger_rows' => (int) ($totals->rows_total ?? 0),
            'units_on_hand' => (int) ($totals->units ?? 0),
            'pieces_on_hand' => (int) ($totals->pieces ?? 0),
            'low_stock_items' => (int) $scoped()
                ->whereColumn('s.quantity', '<=', 's.min_stock_level')
                ->where('s.min_stock_level', '>', 0)
                ->distinct()
                ->count('iv.item_id'),
            'out_of_stock_items' => (int) $scoped()
                ->where('s.quantity', '<=', 0)
                ->distinct()
                ->count('iv.item_id'),
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Item-level ledger
    |--------------------------------------------------------------------------
    */

    /**
     * One row per item, in the units the location is spoken in.
     *
     * @return array{rows: array<int, array<string, mixed>>, total_items: int, page: int, last_page: int}
     */
    public function paginateItems(
        ?string $locationType = null,
        ?int $locationId = null,
        ?string $search = null,
        int $page = 1,
        int $perPage = 25,
    ): array {
        $total = (int) $this->itemQuery($locationType, $locationId, $search)
            ->distinct()
            ->count('iv.item_id');

        $page = max(1, $page);
        $lastPage = max(1, (int) ceil($total / max(1, $perPage)));

        $rows = $this->itemQuery($locationType, $locationId, $search)
            ->selectRaw('iv.item_id')
            ->selectRaw('MAX(i.product_name) as product_name')
            // `items` has no sku of its own; the variants carry it. One
            // representative sku is enough for a search hit to be recognisable.
            ->selectRaw('MIN(iv.sku) as item_sku')
            ->selectRaw('COUNT(DISTINCT iv.id) as variant_count')
            ->selectRaw('COALESCE(SUM(s.quantity), 0) as units')
            ->selectRaw('COALESCE(SUM(s.quantity * ' . $this->piecesExpression() . '), 0) as pieces')
            ->selectRaw('MIN(s.quantity - s.min_stock_level) as headroom')
            ->selectRaw('MAX(s.min_stock_level) as min_stock_level')
            ->selectRaw('MAX(s.updated_at) as updated_at')
            ->groupBy('iv.item_id')
            ->orderByDesc('pieces')
            ->forPage($page, $perPage)
            ->get();

        $mode = $locationType !== null && $locationId !== null
            ? $this->displayModeForLocation($locationType, $locationId)
            // Across the whole network, bulk is what matters.
            : PackagingLadder::DISPLAY_BREAKDOWN;

        // One ladder query for the page rather than one per row.
        $ladders = $this->ladder->forItems($rows->pluck('item_id')->map(fn ($id): int => (int) $id)->all());

        return [
            'rows' => $rows->map(function ($row) use ($mode, $ladders): array {
                $itemId = (int) $row->item_id;
                $pieces = (int) $row->pieces;
                $units = $this->ladder->units($pieces, $itemId, $mode, $ladders[$itemId] ?? null);

                return [
                    'item_id' => $itemId,
                    'product_name' => (string) ($row->product_name ?? 'Unnamed product'),
                    'item_sku' => $row->item_sku,
                    'variant_count' => (int) $row->variant_count,
                    // Raw ledger sum, in mixed variant units. Kept for audit
                    // only — it is the figure that used to be shown as "units"
                    // and it is not comparable across variants.
                    'ledger_units' => (int) $row->units,
                    'pieces' => $pieces,
                    'units' => $units,
                    'display' => $this->ladder->label($units),
                    'display_mode' => $mode,
                    'headroom' => (int) $row->headroom,
                    'min_stock_level' => (int) $row->min_stock_level,
                    'status' => $this->status($pieces, (int) $row->headroom),
                    'updated_at' => $row->updated_at,
                ];
            })->values()->all(),
            'total_items' => $total,
            'page' => $page,
            'last_page' => $lastPage,
        ];
    }

    /**
     * The variant rows behind one item — the detail a stock keeper opens to
     * actually receive or recount, since a count is always against a variant.
     *
     * @return array<int, array<string, mixed>>
     */
    public function variantsForItem(int $itemId, ?string $locationType = null, ?int $locationId = null): array
    {
        $rows = $this->baseQuery($locationType, $locationId)
            ->leftJoin('item_packaging_types as pt', 'pt.id', '=', 'iv.item_packaging_type_id')
            ->leftJoin('item_colors as c', 'c.id', '=', 'iv.item_color_id')
            ->leftJoin('item_sizes as z', 'z.id', '=', 'iv.item_size_id')
            ->where('iv.item_id', $itemId)
            ->selectRaw('s.id as stock_id, s.item_variant_id, s.quantity, s.min_stock_level, s.location_type, s.location_id, s.updated_at')
            ->selectRaw('iv.sku, pt.name as packaging, c.name as color, z.name as size')
            ->selectRaw($this->piecesExpression() . ' as pieces_per_unit')
            ->orderByDesc('s.quantity')
            ->get();

        return $rows->map(function ($row): array {
            $per = max(1, (int) $row->pieces_per_unit);
            $quantity = (int) $row->quantity;

            return [
                'stock_id' => (int) $row->stock_id,
                'variant_id' => (int) $row->item_variant_id,
                'sku' => $row->sku,
                'variant_label' => collect([$row->color, $row->size])->filter()->join(' / ') ?: 'Standard',
                // The unit this row is counted in — "11 Cartons", not "11 units".
                'unit' => (string) ($row->packaging ?? 'Piece'),
                'quantity' => $quantity,
                'pieces_per_unit' => $per,
                'pieces' => $quantity * $per,
                'min_stock_level' => (int) $row->min_stock_level,
                'location_name' => $this->locationLabel((string) $row->location_type, (int) $row->location_id),
                'updated_at' => $row->updated_at,
            ];
        })->values()->all();
    }

    /**
     * Pieces of each item at one location.
     *
     * @param  array<int, int>  $itemIds
     * @return array<int, int>  item id => pieces
     */
    public function piecesByItem(array $itemIds, string $locationType, int $locationId): array
    {
        if ($itemIds === []) {
            return [];
        }

        return $this->baseQuery($locationType, $locationId)
            ->whereIn('iv.item_id', $itemIds)
            ->groupBy('iv.item_id')
            ->selectRaw('iv.item_id, COALESCE(SUM(s.quantity * ' . $this->piecesExpression() . '), 0) as pieces')
            ->pluck('pieces', 'item_id')
            ->map(fn ($pieces): int => (int) $pieces)
            ->all();
    }

    /**
     * Pieces of a set of variants at one location — the figure capacity bands
     * and the sourcing hierarchy compare against.
     *
     * @param  array<int, int>  $variantIds
     */
    public function piecesForVariants(array $variantIds, string $locationType, int $locationId): int
    {
        if ($variantIds === []) {
            return 0;
        }

        return (int) $this->baseQuery($locationType, $locationId)
            ->whereIn('s.item_variant_id', $variantIds)
            ->selectRaw('COALESCE(SUM(s.quantity * ' . $this->piecesExpression() . '), 0) as pieces')
            ->value('pieces');
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    /**
     * `item_stocks` joined to its variant, with the pieces-per-unit joins the
     * piece expression needs.
     */
    private function baseQuery(?string $locationType = null, ?int $locationId = null): Builder
    {
        $query = DB::table('item_stocks as s')
            ->join('item_variants as iv', function ($join): void {
                $join->on('iv.id', '=', 's.item_variant_id')->whereNull('iv.deleted_at');
            })
            ->leftJoin('item_variant_packaging_quantity as ivpq', function ($join): void {
                $join->on('ivpq.item_variant_id', '=', 'iv.id')
                    ->whereColumn('ivpq.item_packaging_type_id', 'iv.item_packaging_type_id');
            })
            ->leftJoin('item_packaging_type_item as ipti', function ($join): void {
                $join->on('ipti.item_id', '=', 'iv.item_id')
                    ->whereColumn('ipti.item_packaging_type_id', 'iv.item_packaging_type_id');
            });

        // Addresses resolve to stockable leaves (STOCK_PLAN.md phase 4): a
        // store means its shelf + floor, a hub its own leaf. See StockScope.
        if ($locationType !== null) {
            $query->whereIn('s.stock_location_id', $locationId !== null
                ? $this->scope->leafIds($locationType, $locationId)
                : $this->scope->leafIdsForType($locationType));
        }

        if ($this->onlyLeafIds !== null) {
            $query->whereIn('s.stock_location_id', $this->onlyLeafIds);
        }

        return $query;
    }

    private function itemQuery(?string $locationType, ?int $locationId, ?string $search): Builder
    {
        $query = $this->baseQuery($locationType, $locationId)
            ->join('items as i', 'i.id', '=', 'iv.item_id');

        if ($search !== null && $search !== '') {
            $term = '%' . $search . '%';

            $query->where(function ($inner) use ($term): void {
                $inner->where('i.product_name', 'LIKE', $term)
                    ->orWhere('iv.sku', 'LIKE', $term)
                    ->orWhere('iv.barcode', 'LIKE', $term);
            });
        }

        return $query;
    }

    /**
     * Pieces in one unit of the joined variant.
     *
     * One definition, on PackagingLadder, so the reader, the planner and the
     * seeder cannot disagree about what a unit is worth.
     */
    private function piecesExpression(): string
    {
        return PackagingLadder::piecesPerUnitSql();
    }

    private function status(int $pieces, int $headroom): string
    {
        if ($pieces <= 0) {
            return 'out_of_stock';
        }

        return $headroom <= 0 ? 'low_stock' : 'healthy';
    }

    private function locationLabel(string $locationType, int $locationId): string
    {
        $node = $this->domain->describe($locationType, $locationId);

        return match ($locationType) {
            Store::class, Warehouse::class, ItemInventoryLocation::class => $node['label'] . ' · ' . $node['name'],
            default => $node['name'],
        };
    }
}
