<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Item\Item;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * How a quantity of one item is spoken about.
 *
 * `item_stocks.quantity` is counted in the *variant's own* packaging unit: a row
 * of 11 against a Carton variant is 11 cartons, a row of 6 against a Piece
 * variant is 6 pieces. Totalling those numbers directly is meaningless — it is
 * what made a store holding 3,617 pieces report "47 units" — so every figure is
 * converted to pieces first and then spoken in the item's own packaging ladder.
 *
 * The ladder comes from `item_packaging_type_item`, which records how many
 * pieces one unit of each packaging holds *for that item*: Piece 1, Carton 120.
 * Two ways of saying the same total:
 *
 *   breakdown  biggest unit first — "30 Cartons · 17 Pieces".
 *              Used wherever bulk is what matters: a store as a whole, a back
 *              room, a remote or main warehouse.
 *   smallest   the first/smallest unit only — "3,617 Pieces".
 *              Used on a shop shelf, where stock is handled and sold one at a
 *              time and a carton figure tells the floor nothing.
 *
 * @see \App\Services\Inventory\ItemStockReader which picks the mode per location.
 */
class PackagingLadder
{
    /** Biggest unit first: "30 Cartons · 17 Pieces". */
    public const DISPLAY_BREAKDOWN = 'breakdown';

    /** The smallest unit only: "3,617 Pieces". */
    public const DISPLAY_SMALLEST = 'smallest';

    /**
     * Ladders already resolved this request, keyed by item id.
     *
     * @var array<int, array<int, array{id: int|null, name: string, pieces: int}>>
     */
    private array $ladders = [];

    /** @var array<int, int>|null variant id => pieces in one of its units */
    private ?array $piecesPerUnit = null;

    /**
     * Pieces in one unit of the joined variant, as SQL.
     *
     * The variant's own packaging quantity, then the item's declaration for that
     * packaging, then one — and never zero, because a zero would multiply a
     * row's stock away to nothing.
     *
     * Written as CASE rather than GREATEST() on purpose: GREATEST is MySQL-only
     * and the test suite runs on SQLite, where it does not exist. Expects the
     * joins `ivpq` (item_variant_packaging_quantity) and `ipti`
     * (item_packaging_type_item) to be in scope.
     */
    public static function piecesPerUnitSql(): string
    {
        return '(CASE WHEN COALESCE(ivpq.quantity, ipti.quantity, 1) > 0 '
            . 'THEN COALESCE(ivpq.quantity, ipti.quantity, 1) ELSE 1 END)';
    }

    /*
    |--------------------------------------------------------------------------
    | The ladder
    |--------------------------------------------------------------------------
    */

    /**
     * An item's packaging tiers, biggest first.
     *
     * @return array<int, array{id: int|null, name: string, pieces: int}>
     */
    public function forItem(int $itemId): array
    {
        return $this->forItems([$itemId])[$itemId] ?? $this->fallbackLadder();
    }

    /**
     * Ladders for many items in one query.
     *
     * @param  array<int, int>  $itemIds
     * @return array<int, array<int, array{id: int|null, name: string, pieces: int}>>
     */
    public function forItems(array $itemIds): array
    {
        $itemIds = array_values(array_unique(array_map('intval', $itemIds)));
        $missing = array_values(array_diff($itemIds, array_keys($this->ladders)));

        if ($missing !== []) {
            $this->loadLadders($missing);
        }

        $result = [];

        foreach ($itemIds as $itemId) {
            $result[$itemId] = $this->ladders[$itemId] ?? $this->fallbackLadder();
        }

        return $result;
    }

    /**
     * The smallest unit an item is handled in — what a shelf figure is counted
     * in. Usually "Piece", but an item only ever packeted says "Packet".
     *
     * @return array{id: int|null, name: string, pieces: int}
     */
    public function smallestTier(int $itemId): array
    {
        $tiers = $this->forItem($itemId);

        return end($tiers) ?: $this->fallbackTier();
    }

    /**
     * @return array{id: int|null, name: string, pieces: int}
     */
    public function largestTier(int $itemId): array
    {
        $tiers = $this->forItem($itemId);

        return $tiers[0] ?? $this->fallbackTier();
    }

    /*
    |--------------------------------------------------------------------------
    | Pieces
    |--------------------------------------------------------------------------
    */

    /**
     * Pieces in one unit of each variant.
     *
     * Loaded for the whole catalogue in a single query the first time it is
     * asked for: callers convert thousands of ledger rows, and resolving this
     * per row was one query each.
     *
     * @return array<int, int>
     */
    public function piecesPerUnitByVariant(): array
    {
        if ($this->piecesPerUnit !== null) {
            return $this->piecesPerUnit;
        }

        // The variant's own packaging row. A variant whose packaging has no
        // pivot quantity counts as one piece rather than zero — zero would
        // silently erase its stock from every total.
        $rows = DB::table('item_variants as iv')
            ->leftJoin('item_variant_packaging_quantity as ivpq', function ($join): void {
                $join->on('ivpq.item_variant_id', '=', 'iv.id')
                    ->whereColumn('ivpq.item_packaging_type_id', 'iv.item_packaging_type_id');
            })
            ->leftJoin('item_packaging_type_item as ipti', function ($join): void {
                $join->on('ipti.item_id', '=', 'iv.item_id')
                    ->whereColumn('ipti.item_packaging_type_id', 'iv.item_packaging_type_id');
            })
            ->selectRaw('iv.id, ' . self::piecesPerUnitSql() . ' as pieces')
            ->get();

        $map = [];

        foreach ($rows as $row) {
            $map[(int) $row->id] = (int) $row->pieces;
        }

        return $this->piecesPerUnit = $map;
    }

    /** Pieces in one unit of a single variant. */
    public function piecesPerUnit(int $variantId): int
    {
        return max(1, $this->piecesPerUnitByVariant()[$variantId] ?? 1);
    }

    /*
    |--------------------------------------------------------------------------
    | Saying it
    |--------------------------------------------------------------------------
    */

    /**
     * Decompose a piece total into the item's units, biggest first.
     *
     * Tiers that come out at zero are dropped, so 3,600 pieces reads
     * "30 Cartons" rather than "30 Cartons, 0 Pieces". A total of nothing keeps
     * the smallest tier so the UI has a unit to print beside the zero.
     *
     * @param  array<int, array{id: int|null, name: string, pieces: int}>|null  $tiers
     * @return array<int, array{unit: string, count: int, pieces: int}>
     */
    public function breakdown(int $pieces, int $itemId, ?array $tiers = null): array
    {
        $tiers = $tiers ?? $this->forItem($itemId);
        $remaining = max(0, $pieces);
        $parts = [];

        foreach ($tiers as $tier) {
            $per = max(1, (int) $tier['pieces']);
            $count = intdiv($remaining, $per);

            if ($count > 0) {
                $parts[] = ['unit' => $tier['name'], 'count' => $count, 'pieces' => $per];
                $remaining -= $count * $per;
            }
        }

        if ($parts === []) {
            $smallest = end($tiers) ?: $this->fallbackTier();
            $parts[] = ['unit' => $smallest['name'], 'count' => 0, 'pieces' => max(1, (int) $smallest['pieces'])];
        }

        return $parts;
    }

    /**
     * The same total in the smallest unit only.
     *
     * @param  array<int, array{id: int|null, name: string, pieces: int}>|null  $tiers
     * @return array<int, array{unit: string, count: int, pieces: int}>
     */
    public function smallest(int $pieces, int $itemId, ?array $tiers = null): array
    {
        $tiers = $tiers ?? $this->forItem($itemId);
        $smallest = end($tiers) ?: $this->fallbackTier();
        $per = max(1, (int) $smallest['pieces']);

        return [[
            'unit' => $smallest['name'],
            'count' => intdiv(max(0, $pieces), $per),
            'pieces' => $per,
        ]];
    }

    /**
     * Units for a piece total in the given mode.
     *
     * @param  array<int, array{id: int|null, name: string, pieces: int}>|null  $tiers
     * @return array<int, array{unit: string, count: int, pieces: int}>
     */
    public function units(int $pieces, int $itemId, string $mode, ?array $tiers = null): array
    {
        return $mode === self::DISPLAY_SMALLEST
            ? $this->smallest($pieces, $itemId, $tiers)
            : $this->breakdown($pieces, $itemId, $tiers);
    }

    /**
     * "30 Cartons · 17 Pieces", or "3,617 Pieces" in smallest mode.
     *
     * @param  array<int, array{unit: string, count: int, pieces: int}>  $units
     */
    public function label(array $units, string $separator = ' · '): string
    {
        if ($units === []) {
            return '0';
        }

        return implode($separator, array_map(
            fn (array $part): string => number_format($part['count']) . ' ' . Str::plural($part['unit'], $part['count']),
            $units,
        ));
    }

    /**
     * One call for the shape every screen needs.
     *
     * @param  array<int, array{id: int|null, name: string, pieces: int}>|null  $tiers
     * @return array{pieces: int, units: array<int, array{unit: string, count: int, pieces: int}>, label: string, mode: string}
     */
    public function present(int $pieces, int $itemId, string $mode, ?array $tiers = null): array
    {
        $units = $this->units($pieces, $itemId, $mode, $tiers);

        return [
            'pieces' => max(0, $pieces),
            'units' => $units,
            'label' => $this->label($units),
            'mode' => $mode,
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    /**
     * @param  array<int, int>  $itemIds
     */
    private function loadLadders(array $itemIds): void
    {
        // What the item itself declares, which is the authority.
        $rows = DB::table('item_packaging_type_item as ipti')
            ->join('item_packaging_types as pt', 'pt.id', '=', 'ipti.item_packaging_type_id')
            ->whereIn('ipti.item_id', $itemIds)
            ->selectRaw('ipti.item_id, pt.id as packaging_id, pt.name, (CASE WHEN COALESCE(ipti.quantity, 1) > 0 THEN COALESCE(ipti.quantity, 1) ELSE 1 END) as pieces')
            ->get();

        $byItem = [];

        foreach ($rows as $row) {
            $byItem[(int) $row->item_id][(int) $row->packaging_id] = [
                'id' => (int) $row->packaging_id,
                'name' => (string) $row->name,
                'pieces' => (int) $row->pieces,
            ];
        }

        // Fall back to whatever its variants are actually packaged in, so an
        // item missing its pivot rows still speaks in real units.
        $missing = array_values(array_diff($itemIds, array_keys($byItem)));

        if ($missing !== []) {
            $variantRows = DB::table('item_variants as iv')
                ->join('item_packaging_types as pt', 'pt.id', '=', 'iv.item_packaging_type_id')
                ->leftJoin('item_variant_packaging_quantity as ivpq', function ($join): void {
                    $join->on('ivpq.item_variant_id', '=', 'iv.id')
                        ->whereColumn('ivpq.item_packaging_type_id', 'iv.item_packaging_type_id');
                })
                ->whereIn('iv.item_id', $missing)
                ->whereNull('iv.deleted_at')
                ->selectRaw('iv.item_id, pt.id as packaging_id, pt.name, MAX(CASE WHEN COALESCE(ivpq.quantity, 1) > 0 THEN COALESCE(ivpq.quantity, 1) ELSE 1 END) as pieces')
                ->groupBy('iv.item_id', 'pt.id', 'pt.name')
                ->get();

            foreach ($variantRows as $row) {
                $byItem[(int) $row->item_id][(int) $row->packaging_id] = [
                    'id' => (int) $row->packaging_id,
                    'name' => (string) $row->name,
                    'pieces' => (int) $row->pieces,
                ];
            }
        }

        foreach ($itemIds as $itemId) {
            $tiers = array_values($byItem[$itemId] ?? []);

            // Biggest first, which is the order both display modes read from.
            usort($tiers, fn (array $a, array $b): int => $b['pieces'] <=> $a['pieces']);

            $this->ladders[$itemId] = $tiers === [] ? $this->fallbackLadder() : $tiers;
        }
    }

    /**
     * @return array<int, array{id: int|null, name: string, pieces: int}>
     */
    private function fallbackLadder(): array
    {
        return [$this->fallbackTier()];
    }

    /** @return array{id: int|null, name: string, pieces: int} */
    private function fallbackTier(): array
    {
        return ['id' => null, 'name' => 'Piece', 'pieces' => 1];
    }

    /** Convenience for callers holding a model rather than an id. */
    public function forItemModel(Item $item): array
    {
        return $this->forItem((int) $item->id);
    }
}
