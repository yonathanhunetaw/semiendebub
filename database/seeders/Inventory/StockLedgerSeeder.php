<?php

declare(strict_types=1);

namespace Database\Seeders\Inventory;

use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Store\Store;
use App\Services\Inventory\PackagingLadder;
use App\Services\Inventory\ShelfMatrix;
use App\Services\Inventory\StockLocationTree;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * The one place that seeds `item_stocks`, and the Main Store's shelf planogram.
 *
 * `item_stocks` is the ledger of record: stock is booked against an item_variant
 * at a location, in that variant's own packaging unit (11 against a Carton
 * variant is 11 cartons). Only the Main Store trades, so only it is stocked:
 *
 *   Store Shelf   every item has a bin (a ShelfItemBand: max, refill line,
 *                 critical line) sized to what a shelf bin physically holds,
 *                 counted in the item's smallest unit. Bins start at mixed
 *                 levels — mostly healthy, some due a refill, a few critical
 *                 or empty — so the shelf and the refill flow have work to show.
 *   Store Floor   twenty fast movers, in bulk and mid-size packs.
 *   Remote Hub    every item, 50 of its biggest pack (per colour/size variant).
 *   warehouses    bulk only — the largest-packaged variant of each item, in
 *                 warehouse quantities, so shipments to the store have a source.
 *
 *   Online Store  every item, every pack, on its floor — it has no shelf. This
 *                 is what the public storefront sells from.
 *
 * Second Store carries nothing (see ItemStoreSeeder).
 *
 *     php artisan db:seed --class=Database\\Seeders\\Inventory\\StockLedgerSeeder
 */
class StockLedgerSeeder extends Seeder
{
    private const STORE = 'Main Store';

    private const ONLINE_STORE = 'Online Store';

    /** Items a warehouse carries. Hubs stock broadly, not exhaustively. */
    private const ITEMS_PER_WAREHOUSE = 80;

    /** Units of each item's biggest pack the Remote Hub holds, per variant. */
    private const REMOTE_HUB_UNITS = 50;

    /** One shelf bin: roughly 40 × 30 × 20 cm. */
    private const BIN_CBM = 0.024;

    /** The fast movers kept on the store floor, by ItemSeeder file_prefix. */
    private const FLOOR_ITEMS = [
        'bic', 'pen-diamond', 'pen-box-hello', 'pencil-nann', 'pencil-vneeds',
        'eraser-shaped', 'rotring-eraser', 'sharpener', 'ruler-30cm-normal', 'noteit',
        'marker-whiteboard', 'fluid-normal', 'handwriting', 'notebook-9x7', 'subject-3-4-5',
        'displaybook-40', 'boxfile-black-color', 'stapler-kangaroo', 'watercolor', '2025-1',
    ];

    public function __construct(
        private readonly StockLocationTree $tree,
        private readonly ShelfMatrix $shelves,
        private readonly PackagingLadder $ladder,
    ) {
    }

    public function run(): void
    {
        $tiers = $this->variantTiers();

        if ($tiers === []) {
            $this->command?->warn('No item variants to stock — run the item seeders first.');

            return;
        }

        $store = Store::query()->where('name', self::STORE)->first();

        if ($store === null) {
            $this->command?->warn('No '.self::STORE.' to stock.');

            return;
        }

        // Same layout and levels on every run.
        mt_srand(2026);

        $this->command?->info('Seeding item_stocks (the ledger of record)…');

        $rows = array_merge(
            $this->stockShelf($store, $tiers),
            $this->stockFloor($store, $tiers),
            $this->stockRemoteHub($store, $tiers),
            $this->stockOnlineStore($tiers),
            $this->stockWarehouses($tiers),
        );

        $this->upsert($rows);

        $this->report();
    }

    /*
    |--------------------------------------------------------------------------
    | What each location gets
    |--------------------------------------------------------------------------
    */

    /**
     * Give every item a bin on the store's shelf and put stock in it.
     *
     * @param  array<int, array<int, array{variant_id: int, pieces: int}>>  $tiers
     * @return array<int, array<string, mixed>>
     */
    private function stockShelf(Store $store, array $tiers): array
    {
        $shelf = ItemInventoryLocation::query()
            ->where('store_id', $store->id)
            ->where('kind', ItemInventoryLocation::KIND_SHELF)
            ->first();
        $shelfNode = $shelf === null
            ? null
            : StockLocation::query()->find($this->tree->leafIdFor(ItemInventoryLocation::class, (int) $shelf->id));

        if ($shelf === null || $shelfNode === null) {
            $this->command?->warn(self::STORE.' has no Store Shelf; skipping bins.');

            return [];
        }

        $cbm = $this->unitCbm();
        $items = Item::query()->whereIn('id', array_keys($tiers))->orderBy('id')->get();
        $rows = [];

        foreach ($items as $item) {
            $smallest = $this->ladder->smallestTier((int) $item->id);
            [$max, $refill, $critical] = $this->band($cbm[$item->id][$smallest['id']] ?? null);

            $this->shelves->setBand($shelfNode, $item, $smallest['id'], $max, $refill, $critical);

            $level = $this->shelfLevel($max, $refill, $critical);
            $variants = $this->smallestVariants($tiers[$item->id]);

            foreach ($this->spread($level, count($variants)) as $index => $quantity) {
                $rows[] = $this->row($variants[$index], ItemInventoryLocation::class, (int) $shelf->id, $quantity, $critical);
            }
        }

        $this->command?->info("  Store Shelf bins: {$items->count()}");

        return $rows;
    }

    /**
     * The floor holds a handful of fast movers in bulk: a few of the biggest
     * pack and, where the item has one, more of the middle pack.
     *
     * @param  array<int, array<int, array{variant_id: int, pieces: int}>>  $tiers
     * @return array<int, array<string, mixed>>
     */
    private function stockFloor(Store $store, array $tiers): array
    {
        $rows = [];
        $itemIds = Item::query()->whereIn('file_prefix', self::FLOOR_ITEMS)->pluck('id');

        foreach ($itemIds as $itemId) {
            $ladder = array_values(array_unique(array_column($tiers[$itemId] ?? [], 'pieces')));

            foreach ($tiers[$itemId] ?? [] as $variant) {
                $quantity = match (true) {
                    $variant['pieces'] === $ladder[0] && count($ladder) > 1 => mt_rand(2, 6),
                    count($ladder) > 2 && $variant['pieces'] === $ladder[1] => mt_rand(5, 15),
                    default => 0,
                };

                if ($quantity > 0) {
                    $rows[] = $this->row($variant['variant_id'], Store::class, (int) $store->id, $quantity, 2);
                }
            }
        }

        $this->command?->info("  Store Floor items: {$itemIds->count()}");

        return $rows;
    }

    /**
     * The online store sells every pack, so every variant is stocked: bulk
     * packs in few, loose ones in many, so a total reads "20 Cartons · 3 Pieces".
     *
     * @param  array<int, array<int, array{variant_id: int, pieces: int}>>  $tiers
     * @return array<int, array<string, mixed>>
     */
    private function stockOnlineStore(array $tiers): array
    {
        $store = Store::query()->where('name', self::ONLINE_STORE)->first();

        if ($store === null) {
            return [];
        }

        $rows = [];

        foreach ($tiers as $variants) {
            $largest = $variants[0]['pieces'];

            foreach ($variants as $variant) {
                $bulk = $largest > 1 && $variant['pieces'] === $largest;
                $rows[] = $this->row($variant['variant_id'], Store::class, (int) $store->id, $bulk ? mt_rand(8, 30) : mt_rand(2, 40), $bulk ? 4 : 10);
            }
        }

        return $rows;
    }

    /**
     * @param  array<int, array<int, array{variant_id: int, pieces: int}>>  $tiers
     * @return array<int, array<string, mixed>>
     */
    private function stockRemoteHub(Store $store, array $tiers): array
    {
        $hub = StockLocation::query()
            ->where('store_id', $store->id)
            ->ofKind(StockLocation::KIND_REMOTE_HUB)
            ->first();

        if ($hub === null) {
            $this->command?->warn(self::STORE.' has no Remote Hub; run StockLocationSeeder first.');

            return [];
        }

        $rows = [];

        foreach ($tiers as $variants) {
            foreach ($variants as $variant) {
                if ($variant['pieces'] === $variants[0]['pieces']) {
                    $rows[] = $this->row($variant['variant_id'], StockLocation::class, (int) $hub->id, self::REMOTE_HUB_UNITS, 10);
                }
            }
        }

        return $rows;
    }

    /**
     * Warehouses — both the `warehouses` rows and the warehouse-type facilities
     * in `stores` — hold bulk: the largest-packaged variant, in quantity.
     *
     * @param  array<int, array<int, array{variant_id: int, pieces: int}>>  $tiers
     * @return array<int, array<string, mixed>>
     */
    private function stockWarehouses(array $tiers): array
    {
        $rows = [];

        $itemIds = array_slice(array_keys($tiers), 0, self::ITEMS_PER_WAREHOUSE);

        $destinations = [];

        foreach (Warehouse::query()->get() as $warehouse) {
            $destinations[] = [Warehouse::class, (int) $warehouse->id];
        }

        foreach (Store::query()->warehouses()->get() as $facility) {
            $destinations[] = [Store::class, (int) $facility->id];
        }

        foreach ($destinations as [$type, $id]) {
            foreach ($itemIds as $itemId) {
                $largest = $tiers[$itemId][0] ?? null;

                if ($largest === null) {
                    continue;
                }

                $rows[] = $this->row($largest['variant_id'], $type, $id, mt_rand(40, 400), 25);
            }
        }

        return $rows;
    }

    /*
    |--------------------------------------------------------------------------
    | Shelf bins
    |--------------------------------------------------------------------------
    */

    /**
     * Max, refill line and critical line for one bin, in the item's smallest
     * unit: as many as fit in a bin, refill at 40 %, critical at 15 %.
     *
     * @return array{0: int, 1: int, 2: int}
     */
    private function band(?float $unitCbm): array
    {
        $fits = $unitCbm !== null && $unitCbm > 0 ? (int) floor(self::BIN_CBM / $unitCbm) : 24;
        $max = max(2, min(120, $fits));
        $max = match (true) {
            $max >= 100 => (int) (round($max / 10) * 10),
            $max >= 20 => (int) (round($max / 5) * 5),
            default => $max,
        };

        $refill = max(1, (int) round($max * 0.4));
        $critical = min($refill, max(1, (int) round($max * 0.15)));

        return [$max, $refill, $critical];
    }

    /** Where a bin starts: 60 % healthy, 20 % due a refill, 12 % critical, 8 % empty. */
    private function shelfLevel(int $max, int $refill, int $critical): int
    {
        $roll = mt_rand(1, 100);

        return match (true) {
            $roll <= 60 => mt_rand(min($refill + 1, $max), $max),
            $roll <= 80 => mt_rand(min($critical + 1, $refill), $refill),
            $roll <= 92 => mt_rand(1, $critical),
            default => 0,
        };
    }

    /**
     * An item's loose variants — one per colour/size, all in its smallest unit.
     *
     * @param  array<int, array{variant_id: int, pieces: int}>  $variants  biggest first
     * @return array<int, int> variant ids
     */
    private function smallestVariants(array $variants): array
    {
        $smallest = end($variants)['pieces'];

        return array_values(array_map(
            fn (array $variant): int => $variant['variant_id'],
            array_filter($variants, fn (array $variant): bool => $variant['pieces'] === $smallest),
        ));
    }

    /**
     * Share a bin's units across the item's variants, as evenly as whole units allow.
     *
     * @return array<int, int> quantity per variant index, zeros left out
     */
    private function spread(int $total, int $ways): array
    {
        $shares = [];

        for ($i = 0; $i < $ways; $i++) {
            $share = intdiv($total, $ways) + ($i < $total % $ways ? 1 : 0);

            if ($share > 0) {
                $shares[$i] = $share;
            }
        }

        return $shares;
    }

    /**
     * Volume of one unit of each item's packs, from the seeded packaging rows.
     *
     * @return array<int, array<int, float>> item id => packaging type id => cbm
     */
    private function unitCbm(): array
    {
        $rows = DB::table('item_variant_packaging_quantity as q')
            ->join('item_variants as v', 'v.id', '=', 'q.item_variant_id')
            ->whereColumn('q.item_packaging_type_id', 'v.item_packaging_type_id')
            ->whereNull('v.deleted_at')
            ->groupBy('v.item_id', 'q.item_packaging_type_id')
            ->selectRaw('v.item_id, q.item_packaging_type_id, MAX(q.cbm) as cbm')
            ->get();

        $cbm = [];

        foreach ($rows as $row) {
            $cbm[(int) $row->item_id][(int) $row->item_packaging_type_id] = (float) $row->cbm;
        }

        return $cbm;
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    /**
     * Every item's variants, ordered by how many pieces one unit holds —
     * biggest first, so [0] is the bulk variant and the last is the loose one.
     *
     * @return array<int, array<int, array{variant_id: int, pieces: int}>>
     */
    private function variantTiers(): array
    {
        $rows = DB::table('item_variants as iv')
            ->leftJoin('item_variant_packaging_quantity as ivpq', function ($join): void {
                $join->on('ivpq.item_variant_id', '=', 'iv.id')
                    ->whereColumn('ivpq.item_packaging_type_id', 'iv.item_packaging_type_id');
            })
            ->leftJoin('item_packaging_type_item as ipti', function ($join): void {
                $join->on('ipti.item_id', '=', 'iv.item_id')
                    ->whereColumn('ipti.item_packaging_type_id', 'iv.item_packaging_type_id');
            })
            ->whereNull('iv.deleted_at')
            ->selectRaw('iv.id, iv.item_id, ' . PackagingLadder::piecesPerUnitSql() . ' as pieces')
            ->orderBy('iv.item_id')
            ->orderByDesc('pieces')
            ->orderBy('iv.id')
            ->get();

        $tiers = [];

        foreach ($rows as $row) {
            $tiers[(int) $row->item_id][] = [
                'variant_id' => (int) $row->id,
                'pieces' => (int) $row->pieces,
            ];
        }

        return $tiers;
    }

    /** @return array<string, mixed> */
    private function row(int $variantId, string $locationType, int $locationId, int $quantity, int $minimum): array
    {
        return [
            'item_variant_id' => $variantId,
            'location_type' => $locationType,
            'location_id' => $locationId,
            'quantity' => $quantity,
            'min_stock_level' => $minimum,
            'stock_location_id' => $this->tree->leafIdFor($locationType, $locationId),
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function upsert(array $rows): void
    {
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('item_stocks')->upsert(
                $chunk,
                ['item_variant_id', 'location_id', 'location_type'],
                ['quantity', 'min_stock_level', 'stock_location_id', 'updated_at'],
            );
        }
    }

    private function report(): void
    {
        $byType = DB::table('item_stocks')
            ->selectRaw('location_type, COUNT(*) as rows_total, SUM(quantity) as units')
            ->groupBy('location_type')
            ->get();

        foreach ($byType as $row) {
            $this->command?->info(sprintf(
                '  %-46s %6d rows, %9s units',
                class_basename((string) $row->location_type),
                (int) $row->rows_total,
                number_format((int) $row->units),
            ));
        }
    }
}
