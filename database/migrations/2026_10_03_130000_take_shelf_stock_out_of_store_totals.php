<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Store rows stop meaning "the whole store" (STOCK_PLAN.md phase 4 cutover).
 *
 * Until now a retail store's item_stocks row held the store's entire total and
 * shelf rows were a positioned *subset* of it. From here a store's total is
 * shelf + floor, two disjoint leaves, so the floor row must lose whatever is
 * on the shelf:
 *
 *   floor = old store row − shelf
 *
 * Asserted per (variant, store): old store row == new shelf + floor. Refuses
 * when a shelf holds more than its store's row — the two ledgers disagree and
 * a person has to decide which is right.
 *
 * Today no shelf stock is recorded, so this changes nothing; it exists so a
 * database that did position stock on a shelf cuts over correctly.
 *
 * Dry run: STOCK_PLAN_DRY_RUN=1 php artisan migrate
 */
return new class extends Migration
{
    public function up(): void
    {
        $dryRun = filter_var(env('STOCK_PLAN_DRY_RUN', false), FILTER_VALIDATE_BOOLEAN);

        $shelfRows = DB::table('item_stocks as s')
            ->join('stock_locations as l', 'l.id', '=', 's.stock_location_id')
            ->where('l.kind', 'shelf')
            ->where('s.quantity', '>', 0)
            ->get(['s.item_variant_id', 's.quantity', 'l.store_id', 'l.parent_id']);

        $before = $this->storeTotals();

        DB::beginTransaction();

        try {
            $moved = 0;

            foreach ($shelfRows as $shelf) {
                $floorId = DB::table('stock_locations')
                    ->where('parent_id', $shelf->parent_id)
                    ->where('kind', 'backroom')
                    ->value('id');

                $floor = DB::table('item_stocks')
                    ->where('item_variant_id', $shelf->item_variant_id)
                    ->where('stock_location_id', $floorId)
                    ->lockForUpdate()
                    ->first(['id', 'quantity']);

                if ($floor === null || (int) $floor->quantity < (int) $shelf->quantity) {
                    throw new \RuntimeException(sprintf(
                        'Variant #%d at store #%d: shelf holds %d but the store row holds %d. Reconcile before cutover.',
                        $shelf->item_variant_id,
                        $shelf->store_id,
                        $shelf->quantity,
                        $floor?->quantity ?? 0,
                    ));
                }

                DB::table('item_stocks')->where('id', $floor->id)->update([
                    'quantity' => (int) $floor->quantity - (int) $shelf->quantity,
                    'updated_at' => now(),
                ]);

                $moved += (int) $shelf->quantity;
            }

            $after = $this->storeTotals(afterCutover: true);

            if ($before !== $after) {
                throw new \RuntimeException('Store totals changed during cutover for '.count(array_diff_assoc($before, $after) + array_diff_assoc($after, $before)).' variant/store pairs.');
            }
        } catch (\Throwable $e) {
            DB::rollBack();

            throw $e;
        }

        $this->say(sprintf('shelf units taken out of store floors%s: %d across %d rows', $dryRun ? ' (DRY RUN)' : '', $moved, $shelfRows->count()));

        if ($dryRun) {
            DB::rollBack();

            throw new \RuntimeException('STOCK_PLAN_DRY_RUN: cutover rolled back, migration not recorded.');
        }

        DB::commit();
    }

    public function down(): void
    {
        // Put shelf stock back inside the store row.
        $shelfRows = DB::table('item_stocks as s')
            ->join('stock_locations as l', 'l.id', '=', 's.stock_location_id')
            ->where('l.kind', 'shelf')
            ->where('s.quantity', '>', 0)
            ->get(['s.item_variant_id', 's.quantity', 'l.parent_id']);

        foreach ($shelfRows as $shelf) {
            $floorId = DB::table('stock_locations')->where('parent_id', $shelf->parent_id)->where('kind', 'backroom')->value('id');

            DB::table('item_stocks')
                ->where('item_variant_id', $shelf->item_variant_id)
                ->where('stock_location_id', $floorId)
                ->increment('quantity', (int) $shelf->quantity);
        }
    }

    /**
     * "variant#store" => what the store holds. Before cutover that is the floor
     * row alone (it carried the whole total); after, shelf + floor.
     *
     * @return array<string, int>
     */
    private function storeTotals(bool $afterCutover = false): array
    {
        return DB::table('item_stocks as s')
            ->join('stock_locations as l', 'l.id', '=', 's.stock_location_id')
            ->whereIn('l.kind', $afterCutover ? ['shelf', 'backroom'] : ['backroom'])
            ->groupBy('s.item_variant_id', 'l.store_id')
            ->orderBy('s.item_variant_id')
            ->orderBy('l.store_id')
            ->selectRaw('s.item_variant_id, l.store_id, SUM(s.quantity) as total')
            ->get()
            ->mapWithKeys(fn ($row): array => [$row->item_variant_id.'#'.$row->store_id => (int) $row->total])
            ->all();
    }

    private function say(string $line): void
    {
        if (defined('STDOUT') && ! app()->runningUnitTests()) {
            fwrite(STDOUT, '  '.$line.PHP_EOL);
        }
    }
};
