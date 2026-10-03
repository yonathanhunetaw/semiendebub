<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Books every item_stocks row against a stockable leaf (STOCK_PLAN.md phase 2).
 *
 *   location_type = Store (retail)        → that store's floor ("Store")
 *   location_type = Store (warehouse type) → its hub
 *   location_type = Warehouse              → its main hub (Hub A / Hub B)
 *   location_type = ItemInventoryLocation  → its shelf / floor leaf
 *
 * Expand only: the morph columns stay, every reader and writer still uses
 * them, and no quantity changes. App\Models\Concerns\BooksAgainstStockLocation
 * fills the new column for rows those writers create from here on.
 *
 * Why no quantity conversion yet: until the phase-4 cutover a Store row still
 * means "the store's whole total", with shelf rows as a positioned subset of
 * it. The plan's floor = store total − shelf is applied at cutover, in the same
 * step as the readers that depend on it. Today no shelf stock is recorded, so
 * the mapping below already equals the plan's end state; the report prints the
 * shelf units that cutover will subtract.
 *
 * Assertions (any failure rolls back): every row mapped; no row on a group
 * node; no variant mapped twice onto one leaf; per-variant totals identical
 * before and after.
 *
 * Dry run: STOCK_PLAN_DRY_RUN=1 php artisan migrate
 */
return new class extends Migration
{
    private const AREA = 'App\\Models\\StockKeeper\\ItemInventoryLocation';

    public function up(): void
    {
        if (! Schema::hasColumn('item_stocks', 'stock_location_id')) {
            Schema::table('item_stocks', function (Blueprint $table): void {
                // nullOnDelete for now: deleting a store today leaves its stock
                // rows behind, and phase 2 must not start refusing that. Made
                // restrictive with the unique key in phase 5.
                $table->foreignId('stock_location_id')->nullable()->after('location_id')
                    ->constrained('stock_locations')->nullOnDelete();
                $table->index(['item_variant_id', 'stock_location_id']);
            });
        }

        $dryRun = filter_var(env('STOCK_PLAN_DRY_RUN', false), FILTER_VALIDATE_BOOLEAN);
        $before = $this->perVariantTotals();

        DB::beginTransaction();

        try {
            $mapped = $this->backfill();
            $this->assertLedger($before);
            $report = $this->report($mapped);
        } catch (\Throwable $e) {
            DB::rollBack();

            throw $e;
        }

        $this->say('item_stocks → stock_locations'.($dryRun ? ' (DRY RUN)' : '').':');

        foreach ($report as $line) {
            $this->say('  '.$line);
        }

        if ($dryRun) {
            DB::rollBack();

            throw new \RuntimeException('STOCK_PLAN_DRY_RUN: mapping rolled back, migration not recorded.');
        }

        DB::commit();
    }

    public function down(): void
    {
        Schema::table('item_stocks', function (Blueprint $table): void {
            $table->dropForeign(['stock_location_id']);
            $table->dropIndex(['item_variant_id', 'stock_location_id']);
            $table->dropColumn('stock_location_id');
        });
    }

    /** @return int rows updated */
    private function backfill(): int
    {
        $mapped = 0;

        $addresses = DB::table('item_stocks')
            ->select('location_type', 'location_id')
            ->distinct()
            ->get();

        foreach ($addresses as $address) {
            $leafId = $this->leafIdFor((string) $address->location_type, (int) $address->location_id);

            if ($leafId === null) {
                throw new \RuntimeException(sprintf(
                    'item_stocks rows at %s#%d have no stockable location to move to.',
                    $address->location_type,
                    $address->location_id,
                ));
            }

            $mapped += DB::table('item_stocks')
                ->where('location_type', $address->location_type)
                ->where('location_id', $address->location_id)
                ->update(['stock_location_id' => $leafId]);
        }

        return $mapped;
    }

    /** Same resolution as StockLocationTree::leafIdFor(), query builder only. */
    private function leafIdFor(string $type, int $id): ?int
    {
        $node = DB::table('stock_locations')
            ->where('legacy_type', $type)
            ->where('legacy_id', $id)
            ->first(['id', 'kind', 'is_stockable']);

        if ($node !== null && $node->kind === 'store') {
            $node = DB::table('stock_locations')
                ->where('parent_id', $node->id)
                ->where('kind', 'backroom')
                ->first(['id', 'kind', 'is_stockable']);
        }

        return $node !== null && (bool) $node->is_stockable ? (int) $node->id : null;
    }

    /** @param  array<int, int>  $before */
    private function assertLedger(array $before): void
    {
        $failures = [];

        $unmapped = DB::table('item_stocks')->whereNull('stock_location_id')->count();
        if ($unmapped > 0) {
            $failures['unmapped rows'] = $unmapped;
        }

        $onGroupNodes = DB::table('item_stocks as s')
            ->join('stock_locations as l', 'l.id', '=', 's.stock_location_id')
            ->where('l.is_stockable', false)
            ->count();
        if ($onGroupNodes > 0) {
            $failures['rows on non-stockable nodes'] = $onGroupNodes;
        }

        // A Store row and an ItemInventoryLocation floor row for the same
        // variant would both land on the floor and double count it.
        $collisions = DB::table('item_stocks')
            ->select('item_variant_id', 'stock_location_id')
            ->groupBy('item_variant_id', 'stock_location_id')
            ->havingRaw('COUNT(*) > 1')
            ->get()
            ->count();
        if ($collisions > 0) {
            $failures['variant mapped twice onto one leaf'] = $collisions;
        }

        $after = $this->perVariantTotals();
        if ($before !== $after) {
            $failures['variants whose total changed'] = count(array_diff_assoc($before, $after) + array_diff_assoc($after, $before));
        }

        if ($failures !== []) {
            throw new \RuntimeException('item_stocks mapping assertions failed: '.json_encode($failures));
        }
    }

    /** @return array<int, int> variant id => total quantity */
    private function perVariantTotals(): array
    {
        return DB::table('item_stocks')
            ->selectRaw('item_variant_id, SUM(quantity) as total')
            ->groupBy('item_variant_id')
            ->orderBy('item_variant_id')
            ->pluck('total', 'item_variant_id')
            ->map(fn ($total): int => (int) $total)
            ->all();
    }

    /** @return array<int, string> */
    private function report(int $mapped): array
    {
        $lines = [sprintf('%-28s %6d', 'rows mapped', $mapped)];

        $byKind = DB::table('item_stocks as s')
            ->join('stock_locations as l', 'l.id', '=', 's.stock_location_id')
            ->selectRaw('l.kind, COUNT(*) as n, SUM(s.quantity) as qty')
            ->groupBy('l.kind')
            ->orderBy('l.kind')
            ->get();

        foreach ($byKind as $row) {
            $lines[] = sprintf('%-28s %6d rows %9d qty', 'at '.$row->kind, (int) $row->n, (int) $row->qty);
        }

        $shelfUnits = (int) DB::table('item_stocks')
            ->where('location_type', self::AREA)
            ->whereIn('location_id', DB::table('item_inventory_locations')->where('kind', 'shelf')->select('id'))
            ->sum('quantity');

        $lines[] = sprintf('%-28s %6d (subtracted from floor at cutover)', 'shelf units in store totals', $shelfUnits);

        return $lines;
    }

    private function say(string $line): void
    {
        if (defined('STDOUT') && ! app()->runningUnitTests()) {
            fwrite(STDOUT, $line.PHP_EOL);
        }
    }
};
