<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Builds the stock_locations tree from the three tables it replaces
 * (STOCK_PLAN.md phase 1).
 *
 *   stores (retail)                  → `store` group node, not stockable
 *     item_inventory_locations shelf → `shelf` leaf under it
 *     item_inventory_locations back  → `backroom` leaf under it, named
 *                                      "Store": the store floor. There is no
 *                                      separate store room.
 *   warehouses                       → shared `main_hub`
 *   stores (central_warehouse)       → shared `main_hub`
 *   stores (remote_warehouse)        → `remote_hub` with no owning store
 *
 * Plus the three data decisions the plan settled:
 *
 *   - "Main Distribution Hub" / "North Valley Annex" become
 *     "Main Distribution Hub A" / "Main Distribution Hub B" (in `warehouses`
 *     too, so the screens still reading that table agree).
 *   - Main Store gets an empty "Main Store Remote Hub". No other store gets
 *     one; a Remote Hub is never invented.
 *   - "Wesen Warehouse A/B" (item_inventory_locations of kind `other`) are
 *     deleted. The migration refuses if anything still points at them.
 *
 * Additive only: item_stocks is not touched, and every screen keeps reading
 * the old tables. Codes and shapes match App\Services\Inventory\StockLocationTree,
 * which keeps the tree current for rows created after this runs. This file
 * deliberately uses the query builder rather than that service or the models,
 * because phase 5 deletes the legacy models and this must still replay on a
 * fresh database afterwards.
 *
 * Dry run: STOCK_PLAN_DRY_RUN=1 php artisan migrate
 * does all of it inside a transaction, prints the counts, rolls back and stops
 * without recording the migration.
 */
return new class extends Migration
{
    private const STORE = 'App\\Models\\Store\\Store';

    private const WAREHOUSE = 'App\\Models\\Inventory\\Warehouse';

    private const AREA = 'App\\Models\\StockKeeper\\ItemInventoryLocation';

    private const HUB_RENAMES = [
        'Main Distribution Hub' => 'Main Distribution Hub A',
        'North Valley Annex' => 'Main Distribution Hub B',
    ];

    private const REMOTE_HUB_STORE = 'Main Store';

    public function up(): void
    {
        $dryRun = filter_var(env('STOCK_PLAN_DRY_RUN', false), FILTER_VALIDATE_BOOLEAN);
        $stockBefore = $this->stockFingerprint();

        DB::beginTransaction();

        try {
            $report = [
                'hubs renamed' => $this->renameHubs(),
                'wesen rows deleted' => $this->deleteWesen(),
            ];

            $report += $this->buildTree();
            $report['remote hubs created'] = $this->createMainStoreRemoteHub();

            $this->assertTree($stockBefore);
        } catch (\Throwable $e) {
            DB::rollBack();

            throw $e;
        }

        $this->say('stock_locations backfill'.($dryRun ? ' (DRY RUN)' : '').':');

        foreach ($report as $label => $count) {
            $this->say(sprintf('  %-22s %d', $label, $count));
        }

        $this->say(sprintf('  %-22s %d', 'nodes total', DB::table('stock_locations')->count()));

        if ($dryRun) {
            DB::rollBack();

            throw new \RuntimeException('STOCK_PLAN_DRY_RUN: backfill rolled back, migration not recorded.');
        }

        DB::commit();
    }

    public function down(): void
    {
        DB::table('stock_locations')->update(['parent_id' => null]);
        DB::table('stock_locations')->delete();

        foreach (self::HUB_RENAMES as $old => $new) {
            DB::table('warehouses')->where('name', $new)->update(['name' => $old]);
        }

        // Wesen Warehouse A/B are not recreated: they held nothing, and the
        // pre-migration dump in storage/app/backups has them if ever needed.
    }

    private function renameHubs(): int
    {
        $renamed = 0;

        foreach (self::HUB_RENAMES as $old => $new) {
            $renamed += DB::table('warehouses')->where('name', $old)->update([
                'name' => $new,
                'updated_at' => now(),
            ]);
        }

        return $renamed;
    }

    private function deleteWesen(): int
    {
        $ids = DB::table('item_inventory_locations')
            ->where('kind', 'other')
            ->where('name', 'like', 'Wesen Warehouse%')
            ->pluck('id')
            ->all();

        if ($ids === []) {
            return 0;
        }

        $references = [
            'item_stocks' => DB::table('item_stocks')->where('location_type', self::AREA)->whereIn('location_id', $ids)->count(),
            'store_variant_capacities' => DB::table('store_variant_capacities')->where('location_type', self::AREA)->whereIn('location_id', $ids)->count(),
            'users.inventory_location_id' => DB::table('users')->whereIn('inventory_location_id', $ids)->count(),
            'transfers' => DB::table('transfers')
                ->where(fn ($q) => $q->whereIn('from_location_id', $ids)->orWhereIn('to_location_id', $ids)
                    ->orWhere(fn ($q) => $q->where('source_location_type', self::AREA)->whereIn('source_location_id', $ids))
                    ->orWhere(fn ($q) => $q->where('destination_location_type', self::AREA)->whereIn('destination_location_id', $ids)))
                ->count(),
        ];

        $used = array_filter($references);

        if ($used !== []) {
            throw new \RuntimeException('Wesen Warehouse rows are still referenced, refusing to delete: '.json_encode($used));
        }

        return DB::table('item_inventory_locations')->whereIn('id', $ids)->delete();
    }

    /** @return array<string, int> */
    private function buildTree(): array
    {
        $counts = ['store nodes' => 0, 'shelf/backroom leaves' => 0, 'main hubs' => 0, 'facility hubs' => 0];

        foreach (DB::table('stores')->orderBy('id')->get() as $store) {
            if (in_array($store->type, ['central_warehouse', 'remote_warehouse'], true)) {
                $counts['facility hubs'] += $this->insertNode(self::STORE, (int) $store->id, [
                    'kind' => $store->type === 'central_warehouse' ? 'main_hub' : 'remote_hub',
                    'name' => $store->name,
                    'address' => $store->location,
                    'status' => $store->status ?: 'active',
                    'store_id' => null,
                    'parent_id' => null,
                    'is_stockable' => true,
                ], $store->code ?: 'HUB-S'.$store->id);

                continue;
            }

            $counts['store nodes'] += $this->insertNode(self::STORE, (int) $store->id, [
                'kind' => 'store',
                'name' => $store->name,
                'address' => $store->location,
                'status' => $store->status ?: 'active',
                'store_id' => $store->id,
                'parent_id' => null,
                'is_stockable' => false,
            ], 'STORE-'.$store->id);
        }

        $areas = DB::table('item_inventory_locations')
            ->whereIn('kind', ['shelf', 'backroom'])
            ->whereNotNull('store_id')
            ->orderBy('id')
            ->get();

        foreach ($areas as $area) {
            $parentId = $this->nodeId(self::STORE, (int) $area->store_id);

            if ($parentId === null) {
                throw new \RuntimeException("item_inventory_locations#{$area->id} belongs to store #{$area->store_id}, which has no store node.");
            }

            $counts['shelf/backroom leaves'] += $this->insertNode(self::AREA, (int) $area->id, [
                'kind' => $area->kind,
                'name' => $area->kind === 'shelf' ? 'Store Shelf' : 'Store',
                'address' => $area->address ?: null,
                'status' => 'active',
                'store_id' => $area->store_id,
                'parent_id' => $parentId,
                'is_stockable' => true,
            ], 'STORE-'.$area->store_id.($area->kind === 'shelf' ? '-SHELF' : '-FLOOR'));
        }

        foreach (DB::table('warehouses')->orderBy('id')->get() as $warehouse) {
            $counts['main hubs'] += $this->insertNode(self::WAREHOUSE, (int) $warehouse->id, [
                'kind' => 'main_hub',
                'name' => $warehouse->name,
                'address' => $warehouse->address,
                'status' => $warehouse->status ?: 'active',
                'store_id' => null,
                'parent_id' => null,
                'is_stockable' => true,
            ], $warehouse->code ?: 'HUB-W'.$warehouse->id);
        }

        return $counts;
    }

    private function createMainStoreRemoteHub(): int
    {
        $storeId = DB::table('stores')->where('name', self::REMOTE_HUB_STORE)->value('id');

        if ($storeId === null) {
            return 0;
        }

        $parentId = $this->nodeId(self::STORE, (int) $storeId);

        $exists = DB::table('stock_locations')
            ->where('store_id', $storeId)
            ->where('kind', 'remote_hub')
            ->exists();

        if ($parentId === null || $exists) {
            return 0;
        }

        DB::table('stock_locations')->insert([
            'parent_id' => $parentId,
            'kind' => 'remote_hub',
            'name' => self::REMOTE_HUB_STORE.' Remote Hub',
            'code' => $this->freeCode('STORE-'.$storeId.'-REMOTE'),
            'address' => null,
            'status' => 'active',
            'store_id' => $storeId,
            'is_stockable' => true,
            'legacy_type' => null,
            'legacy_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return 1;
    }

    /**
     * Row-count assertions. Any mismatch aborts and rolls everything back.
     *
     * @param  array{rows: int, quantity: int}  $stockBefore
     */
    private function assertTree(array $stockBefore): void
    {
        $retailStores = DB::table('stores')
            ->where(fn ($q) => $q->whereNull('type')->orWhereNotIn('type', ['central_warehouse', 'remote_warehouse']))
            ->count();
        $facilityStores = DB::table('stores')->whereIn('type', ['central_warehouse', 'remote_warehouse'])->count();
        $areas = DB::table('item_inventory_locations')->whereIn('kind', ['shelf', 'backroom'])->whereNotNull('store_id')->count();
        $warehouses = DB::table('warehouses')->count();

        $expect = [
            'store nodes' => [$retailStores, DB::table('stock_locations')->where('kind', 'store')->count()],
            'stores mapped' => [$retailStores + $facilityStores, DB::table('stock_locations')->where('legacy_type', self::STORE)->count()],
            'areas mapped' => [$areas, DB::table('stock_locations')->where('legacy_type', self::AREA)->count()],
            'warehouses mapped' => [$warehouses, DB::table('stock_locations')->where('legacy_type', self::WAREHOUSE)->count()],
            'non-stockable = store nodes' => [
                DB::table('stock_locations')->where('kind', 'store')->count(),
                DB::table('stock_locations')->where('is_stockable', false)->count(),
            ],
            'remote hubs per store <= 1' => [0, DB::table('stock_locations')
                ->where('kind', 'remote_hub')->whereNotNull('store_id')
                ->groupBy('store_id')->havingRaw('COUNT(*) > 1')->pluck('store_id')->count()],
            'leaves have a store parent' => [0, DB::table('stock_locations as c')
                ->whereIn('c.kind', ['shelf', 'backroom', 'remote_hub'])
                ->whereNotNull('c.store_id')
                ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('stock_locations as p')
                    ->whereColumn('p.id', 'c.parent_id')->where('p.kind', 'store')->whereColumn('p.store_id', 'c.store_id'))
                ->count()],
        ];

        $stockAfter = $this->stockFingerprint();
        $expect['item_stocks rows untouched'] = [$stockBefore['rows'], $stockAfter['rows']];
        $expect['item_stocks qty untouched'] = [$stockBefore['quantity'], $stockAfter['quantity']];

        $failed = array_filter($expect, fn (array $pair): bool => $pair[0] !== $pair[1]);

        if ($failed !== []) {
            throw new \RuntimeException('stock_locations backfill assertions failed (expected, actual): '.json_encode($failed));
        }
    }

    /** @return array{rows: int, quantity: int} */
    private function stockFingerprint(): array
    {
        return [
            'rows' => DB::table('item_stocks')->count(),
            'quantity' => (int) DB::table('item_stocks')->sum('quantity'),
        ];
    }

    /** @param  array<string, mixed>  $attributes */
    private function insertNode(string $legacyType, int $legacyId, array $attributes, string $code): int
    {
        if ($this->nodeId($legacyType, $legacyId) !== null) {
            return 0;
        }

        DB::table('stock_locations')->insert($attributes + [
            'code' => $this->freeCode($code),
            'legacy_type' => $legacyType,
            'legacy_id' => $legacyId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return 1;
    }

    private function nodeId(string $legacyType, int $legacyId): ?int
    {
        $id = DB::table('stock_locations')
            ->where('legacy_type', $legacyType)
            ->where('legacy_id', $legacyId)
            ->value('id');

        return $id === null ? null : (int) $id;
    }

    private function freeCode(string $code): string
    {
        $candidate = $code;

        for ($n = 2; DB::table('stock_locations')->where('code', $candidate)->exists(); $n++) {
            $candidate = $code.'-'.$n;
        }

        return $candidate;
    }

    private function say(string $line): void
    {
        if (defined('STDOUT') && ! app()->runningUnitTests()) {
            fwrite(STDOUT, $line.PHP_EOL);
        }
    }
};
