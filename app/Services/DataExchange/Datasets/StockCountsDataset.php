<?php

declare(strict_types=1);

namespace App\Services\DataExchange\Datasets;

use App\Models\Auth\User;
use App\Models\Inventory\ItemStock;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Stocktake;
use App\Models\Item\ItemVariant;
use App\Services\DataExchange\Dataset;
use App\Services\DataExchange\ImportPlan;
use App\Services\Inventory\CatalogueSheet;
use App\Services\Inventory\StocktakeService;
use App\Services\Shared\CsvTable;
use InvalidArgumentException;

/**
 * Counted stock, one count per place. Importing never writes stock: it starts a count at each place, records the
 * figures and submits it, and the ledger changes only when someone approves the count in Admin → Counts (the same
 * count a stock keeper makes by hand, with the same two-person rule). Items not in the file are left uncounted and
 * untouched, and a place that already has a count open is refused until that one is approved or voided.
 *
 * A figure is in the variant's OWN packaging unit: 11 against a Carton variant is 11 cartons, 6 against a Piece
 * variant is 6 pieces (the unit column says which, and a file in another unit is refused).
 */
final class StockCountsDataset extends Dataset
{
    public function __construct(private readonly StocktakeService $takes, private readonly CatalogueSheet $sheet)
    {
    }

    public function key(): string
    {
        return 'stock_counts';
    }

    public function label(): string
    {
        return 'Stock counts';
    }

    public function group(): string
    {
        return 'Inventory';
    }

    public function description(): string
    {
        return 'What is on hand per place, in each variant\'s own unit. Importing makes a count per place for someone to approve in Admin → Counts; it never changes stock itself.';
    }

    public function columns(): array
    {
        return ['location', 'sku', 'item', 'unit', 'counted'];
    }

    public function required(): array
    {
        return ['location', 'sku', 'counted'];
    }

    public function example(): array
    {
        return ['Main Store · Store Shelf', 'DUKA-I1-C2-S3-P1', 'Round-neck T-shirt', 'Piece', 24];
    }

    public function importable(): bool
    {
        return true;
    }

    public function rows(): iterable
    {
        $places = $this->sheet->locations();
        // Read by id only: an orderBy before lazyById makes its pages overlap and repeat rows.
        $stocks = ItemStock::query()->with('itemVariant.item', 'itemVariant.itemPackagingType')->where('quantity', '!=', 0)->lazyById(300);
        foreach ($stocks as $stock) {
            $variant = $stock->itemVariant;
            if (! isset($places[(int) $stock->stock_location_id]) || $variant === null) {
                continue;
            }

            yield [$places[(int) $stock->stock_location_id]['name'], $variant->sku, $variant->item?->product_name, $variant->itemPackagingType?->name, (int) $stock->quantity];
        }
    }

    public function plan(CsvTable $table, User $by, array $options = []): ImportPlan
    {
        $plan = new ImportPlan();
        $have = array_flip($table->header);

        $places = $this->sheet->locations();
        $placeMap = [];
        foreach ($places as $id => $place) {
            $placeMap[mb_strtolower($place['name'])] = $id;
        }
        $placeKnown = array_map(fn (array $place): string => $place['name'], array_values($places));

        $skus = array_values(array_filter(array_map(fn (array $row): string => $row['data']['sku'], $table->rows)));
        $variants = ItemVariant::query()->with('itemPackagingType')->whereIn('sku', $skus)->get()->keyBy('sku');

        /** @var array<int, array<int, array{variant: ItemVariant, counted: int, line: int}>> $lines location id => variant id => line */
        $lines = [];
        foreach ($table->rows as $row) {
            $line = $row['line'];
            $d = $row['data'];
            $errorsBefore = count($table->errors());

            $placeId = $table->lookup($row, 'location', $placeMap, $placeKnown, true);
            $counted = $table->int($row, 'counted', true);
            $variant = $d['sku'] === '' ? null : $variants->get($d['sku']);
            if ($variant === null) {
                $table->error($d['sku'] === '' ? 'sku is empty' : "there is no variant with sku '{$d['sku']}'", $line);
            }
            if ($counted !== null && $counted < 0) {
                $table->error('a count cannot be negative', $line);
            }
            if ($variant !== null && isset($have['unit']) && $d['unit'] !== '') {
                $own = (string) ($variant->itemPackagingType?->name ?? '');
                if (mb_strtolower($own) !== mb_strtolower($d['unit'])) {
                    $table->error("{$variant->sku} is counted in {$own}, not {$d['unit']}: count it in {$own}", $line);
                }
            }
            if ($placeId !== null && $variant !== null && isset($lines[$placeId][$variant->id])) {
                $table->error("{$variant->sku} is already on line {$lines[$placeId][$variant->id]['line']} for that place", $line);
            }
            if (count($table->errors()) > $errorsBefore || $placeId === null || $variant === null || $counted === null) {
                continue;
            }

            $lines[$placeId][(int) $variant->id] = ['variant' => $variant, 'counted' => $counted, 'line' => $line];
        }

        // the places: counted only if they can be, and not while another count is open there
        $locations = StockLocation::query()->whereIn('id', array_keys($lines))->get()->keyBy('id');
        $open = Stocktake::query()->whereIn('stock_location_id', array_keys($lines))->whereIn('status', [Stocktake::COUNTING, Stocktake::SUBMITTED])->get()->keyBy('stock_location_id');
        $current = [];
        foreach (ItemStock::query()->whereIn('stock_location_id', array_keys($lines))->get(['stock_location_id', 'item_variant_id', 'quantity']) as $stock) {
            $current[(int) $stock->stock_location_id][(int) $stock->item_variant_id] = (int) $stock->quantity;
        }

        foreach ($lines as $placeId => $byVariant) {
            $location = $locations->get($placeId);
            $name = $places[$placeId]['name'];
            $firstLine = min(array_column($byVariant, 'line'));

            if ($location === null || ! $location->is_stockable || $location->isTransit()) {
                $table->error("{$name} cannot be counted", $firstLine);

                continue;
            }
            if ($open->has($placeId)) {
                $table->error("{$name} already has a count open ({$open->get($placeId)->reference}): approve or void it first", $firstLine);

                continue;
            }

            $differ = 0;
            foreach ($byVariant as $variantId => $entry) {
                $had = $current[$placeId][$variantId] ?? 0;
                $differ += $entry['counted'] !== $had ? 1 : 0;
                if ($had >= 10 && $entry['counted'] * 2 < $had) {
                    $plan->warn("{$name}: {$entry['variant']->sku} is counted at {$entry['counted']}, the ledger has {$had}");
                }
            }

            $count = count($byVariant);
            $plan->add('create', "{$name}: {$count} ".($count === 1 ? 'line' : 'lines')." counted, {$differ} different from the ledger", function () use ($location, $byVariant, $by): int {
                try {
                    $take = $this->takes->start($location, $by, 'Counted from a file (Settings → Import / Export)');
                    foreach ($byVariant as $variantId => $entry) {
                        $this->takes->count($take, (int) $variantId, $entry['counted'], $by);
                    }
                    $this->takes->submit($take, $by);
                } catch (InvalidArgumentException $e) {
                    throw new \RuntimeException($e->getMessage(), 0, $e); // already checked in the plan; fail loudly, the whole file rolls back
                }

                return (int) $take->id;
            });
        }

        if ($plan->created > 0) {
            $plan->warn('Nothing changes in stock yet: each count waits in Admin → Counts for someone to approve');
        }

        return $plan;
    }
}
