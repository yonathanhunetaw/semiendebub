<?php

declare(strict_types=1);

namespace Database\Seeders\Inventory;

use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Store\Store;
use App\Services\Inventory\StockLocationTree;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * The one place that seeds `item_stocks`.
 *
 * `item_stocks` is the ledger of record: stock is booked against an item_variant
 * at a location, before a StoreVariant exists and whether or not one ever does.
 * Three seeders used to write it — StoreVariantSeeder filled every store,
 * WarehouseSeeder filled two warehouses with ten variants, FacilitySeeder filled
 * the hubs with forty — each with its own idea of what a quantity meant, and
 * none of them ever put a single unit on a shop floor. So every "Store Shelf"
 * figure in the application was zero while the ledger held 136,000 units.
 *
 * What it seeds, and in which units, follows the rule the business reads by:
 *
 *   shop floor          the smallest unit only. A shelf is handled and sold one
 *                       at a time, so only each item's smallest-packaged variant
 *                       is put out, in modest counts.
 *   store (as a whole)  a mix across the item's tiers, so a store total reads
 *                       like real stock: "20 Cartons · 3 Packets · 3 Pieces".
 *   back room           nothing. It is derived as the store total minus the
 *                       shelf, so seeding it would double-count.
 *   warehouses          bulk only — the largest-packaged variant of each item,
 *                       in warehouse quantities.
 *
 * Quantities stay in each variant's own packaging unit, exactly as the column
 * means them: 11 against a Carton variant is 11 cartons.
 *
 *     php artisan db:seed --class=Database\\Seeders\\Inventory\\StockLedgerSeeder
 */
class StockLedgerSeeder extends Seeder
{
    /** Items a warehouse carries. Hubs stock broadly, not exhaustively. */
    private const ITEMS_PER_WAREHOUSE = 80;

    public function __construct(private readonly StockLocationTree $tree)
    {
    }

    public function run(): void
    {
        $tiers = $this->variantTiers();

        if ($tiers === []) {
            $this->command?->warn('No item variants to stock — run the item seeders first.');

            return;
        }

        $this->command?->info('Seeding item_stocks (the ledger of record)…');

        $rows = [];

        $rows = array_merge($rows, $this->stockStores($tiers));
        $rows = array_merge($rows, $this->stockShelves($tiers));
        $rows = array_merge($rows, $this->stockWarehouses($tiers));

        $this->upsert($rows);

        $this->report();
    }

    /*
    |--------------------------------------------------------------------------
    | What each level gets
    |--------------------------------------------------------------------------
    */

    /**
     * Retail stores hold a mix across every tier, so a store total decomposes
     * into something a human would actually say.
     *
     * @param  array<int, array<int, array{variant_id: int, pieces: int}>>  $tiers
     * @return array<int, array<string, mixed>>
     */
    private function stockStores(array $tiers): array
    {
        $rows = [];

        foreach (Store::query()->retail()->get() as $store) {
            foreach ($tiers as $variants) {
                $largest = $variants[0]['pieces'] ?? 1;

                foreach ($variants as $variant) {
                    $rows[] = $this->row(
                        $variant['variant_id'],
                        Store::class,
                        (int) $store->id,
                        // Bulk units come in few, loose units in many — which is
                        // what makes the breakdown read "20 Cartons · 3 Pieces"
                        // rather than "300 Cartons · 300 Pieces".
                        $variant['pieces'] >= $largest && $largest > 1
                            ? random_int(8, 30)
                            : random_int(2, 40),
                        $variant['pieces'] >= $largest && $largest > 1 ? 4 : 10,
                    );
                }
            }
        }

        return $rows;
    }

    /**
     * A shop floor carries only what is sold singly: each item's
     * smallest-packaged variant.
     *
     * Counts are deliberately small. Shelf and floor are separate leaves
     * (STOCK_PLAN.md phase 4), so these units are in addition to the store's
     * floor row, and the store's total is the two together.
     *
     * @param  array<int, array<int, array{variant_id: int, pieces: int}>>  $tiers
     * @return array<int, array<string, mixed>>
     */
    private function stockShelves(array $tiers): array
    {
        $rows = [];

        $shelves = ItemInventoryLocation::query()
            ->where('kind', ItemInventoryLocation::KIND_SHELF)
            ->get();

        foreach ($shelves as $shelf) {
            foreach ($tiers as $variants) {
                $smallest = end($variants);

                if ($smallest === false) {
                    continue;
                }

                $rows[] = $this->row(
                    $smallest['variant_id'],
                    ItemInventoryLocation::class,
                    (int) $shelf->id,
                    random_int(0, 48),
                    6,
                );
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

                $rows[] = $this->row($largest['variant_id'], $type, $id, random_int(40, 400), 25);
            }
        }

        return $rows;
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
            ->selectRaw('iv.id, iv.item_id, ' . \App\Services\Inventory\PackagingLadder::piecesPerUnitSql() . ' as pieces')
            ->orderBy('iv.item_id')
            ->orderByDesc('pieces')
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
