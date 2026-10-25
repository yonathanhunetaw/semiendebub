<?php

declare(strict_types=1);

namespace App\Services\DataExchange\Datasets;

use App\Models\Auth\User;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Item\Item;
use App\Services\DataExchange\Dataset;
use App\Services\DataExchange\ImportPlan;
use App\Services\Inventory\CatalogueSheet;
use App\Services\Inventory\LocationLevels;
use App\Services\Inventory\PackagingLadder;
use App\Services\Inventory\ShelfMatrix;
use App\Services\Shared\CsvTable;

/**
 * Where each item lives and how full it should be: one row per place and item, set in the item's own pack unit,
 * the way the item setup page's "limits" part saves them (ShelfMatrix::setBand for a Store Shelf, LocationLevels::setLevel
 * for a Store Floor, a Remote Hub or a Main Hub). Quantities are never in this file: stock only comes from counts.
 *
 *   location   a place by name, as the Stock counts file spells it ("Main Store · Store Shelf", "Remote Hub (Main Store)" …)
 *   item_id    the item (the item column is only checked, so a sheet for other items is refused)
 *   unit       one of the item's pack units by name (Carton, Packet, Piece …); empty = its smallest unit
 *   max        what the place is set to hold (a shelf's bin when full)
 *   refill     the low line: at or below it, a refill is raised
 *   critical   the nearly-out line (critical ≤ refill ≤ max)
 *
 * On a Store Shelf the row is also what gives the item a bin, and the bins fill in the order they were first given, so
 * the order of new rows in the file is the order on the shelf (A1, B1 … E1, A2 …). An item already on the shelf keeps its bin.
 * Nothing here removes a row: taking an item off a shelf stays on the item's setup page.
 */
final class ItemLevelsDataset extends Dataset
{
    public function __construct(
        private readonly ShelfMatrix $shelves,
        private readonly LocationLevels $levels,
        private readonly PackagingLadder $ladder,
        private readonly CatalogueSheet $sheet,
    ) {
    }

    public function key(): string
    {
        return 'item_levels';
    }

    public function label(): string
    {
        return 'Shelf bins and stock levels';
    }

    public function group(): string
    {
        return 'Inventory';
    }

    public function description(): string
    {
        return 'Which items each shelf, floor, Remote Hub and Main Hub holds, with its max, refill and critical lines in the item\'s own unit. New shelf rows fill the bins in file order. No quantities.';
    }

    public function columns(): array
    {
        return ['location', 'item_id', 'item', 'unit', 'max', 'refill', 'critical'];
    }

    public function required(): array
    {
        return ['location', 'item_id', 'max', 'refill', 'critical'];
    }

    public function example(): array
    {
        return ['Main Store · Store Shelf', 1, '2025 - Agenda', 'Piece', 24, 8, 2];
    }

    public function importable(): bool
    {
        return true;
    }

    public function rows(): iterable
    {
        $places = $this->sheet->locations();
        $bands = ShelfItemBand::query()->with('item')->whereIn('stock_location_id', array_keys($places))->orderBy('stock_location_id')->orderBy('id')->get();
        $ladders = $this->ladder->forItems($bands->pluck('item_id')->all());

        foreach ($bands as $band) {
            $tiers = collect($ladders[(int) $band->item_id] ?? []);
            $tier = $band->item_packaging_type_id !== null ? $tiers->firstWhere('id', (int) $band->item_packaging_type_id) : $this->ladder->smallestTier((int) $band->item_id);

            yield [$places[(int) $band->stock_location_id]['name'], $band->item_id, $band->item?->product_name, $tier['name'] ?? '', $band->max_units, $band->refill_units, $band->critical_units];
        }
    }

    /** No unit means the item's smallest unit, so naming that unit is not a change. */
    private function sameUnit(int $itemId, ?int $wanted, ShelfItemBand $current): bool
    {
        $smallest = $this->ladder->smallestTier($itemId)['id'] ?? null;
        $smallest = $smallest !== null ? (int) $smallest : null;

        return ($wanted ?? $smallest) === ($current->item_packaging_type_id !== null ? (int) $current->item_packaging_type_id : $smallest);
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

        $itemIds = [];
        foreach ($table->rows as $row) {
            if (($id = $table->int($row, 'item_id', true)) !== null) {
                $itemIds[] = $id;
            }
        }
        $items = Item::query()->whereIn('id', $itemIds)->get()->keyBy('id');
        $ladders = $this->ladder->forItems($itemIds);
        $existing = ShelfItemBand::query()->whereIn('item_id', $itemIds)->whereIn('stock_location_id', array_keys($places))->get()
            ->keyBy(fn (ShelfItemBand $b): string => $b->stock_location_id.'|'.$b->item_id);
        $locations = \App\Models\Inventory\StockLocation::query()->whereIn('id', array_keys($places))->get()->keyBy('id');

        $seen = [];
        foreach ($table->rows as $row) {
            $line = $row['line'];
            $d = $row['data'];
            $errorsBefore = count($table->errors());

            $placeId = $table->lookup($row, 'location', $placeMap, $placeKnown, true);
            $itemId = $table->int($row, 'item_id', true);
            $item = $itemId !== null ? $items->get($itemId) : null;
            if ($itemId !== null && $item === null) {
                $table->error("there is no item {$itemId}", $line);
            }
            if ($item !== null && isset($have['item']) && $d['item'] !== '' && mb_strtolower($d['item']) !== mb_strtolower((string) $item->product_name)) {
                $table->error("item {$itemId} is '{$item->product_name}', not '{$d['item']}': download the file again", $line);
            }

            $max = $table->int($row, 'max', true);
            $refill = $table->int($row, 'refill', true);
            $critical = $table->int($row, 'critical', true);
            foreach (['max' => $max, 'refill' => $refill, 'critical' => $critical] as $name => $value) {
                if ($value !== null && ($value < 0 || $value > 10_000_000)) {
                    $table->error("{$name} must be between 0 and 10,000,000", $line);
                }
            }
            if ($max !== null && $refill !== null && $critical !== null && ($max < 1 || $refill > $max || $critical > $refill)) {
                $table->error("the lines must read critical ({$critical}) ≤ refill ({$refill}) ≤ max ({$max}), with a max of at least 1", $line);
            }

            // the unit: one of the item's own pack units, or empty for its smallest
            $unitId = null;
            if ($item !== null && isset($have['unit']) && $d['unit'] !== '') {
                $tier = collect($ladders[$itemId] ?? [])->first(fn (array $t): bool => mb_strtolower($t['name']) === mb_strtolower($d['unit']));
                if ($tier === null) {
                    $known = collect($ladders[$itemId] ?? [])->pluck('name')->implode(', ');
                    $table->error("'{$item->product_name}' is not packed in '{$d['unit']}' (its units: {$known})", $line);
                } else {
                    $unitId = $tier['id'] !== null ? (int) $tier['id'] : null;
                }
            }

            if ($placeId !== null && $itemId !== null) {
                if (isset($seen[$placeId.'|'.$itemId])) {
                    $table->error("item {$itemId} is already on line {$seen[$placeId.'|'.$itemId]} for that place", $line);
                }
                $seen[$placeId.'|'.$itemId] = $line;
            }
            if (count($table->errors()) > $errorsBefore || $placeId === null || $item === null) {
                continue;
            }

            $location = $locations->get($placeId);
            $current = $existing->get($placeId.'|'.$itemId);
            $values = ['item_packaging_type_id' => $unitId, 'max_units' => $max, 'refill_units' => $refill, 'critical_units' => $critical];
            $label = $places[$placeId]['name'].': '.$item->product_name." (max {$max}, refill {$refill}, critical {$critical})";

            $write = function () use ($location, $item, $unitId, $max, $refill, $critical, $by): int {
                $args = [$location, $item, $unitId, $max, $refill, $critical, $by];

                return (int) ($location->kind === \App\Models\Inventory\StockLocation::KIND_SHELF ? $this->shelves->setBand(...$args) : $this->levels->setLevel(...$args))->id;
            };

            if ($current === null) {
                $plan->add('create', $label, $write);
            } elseif ($this->differs($current, ['max_units' => $max, 'refill_units' => $refill, 'critical_units' => $critical]) || ! $this->sameUnit($itemId, $unitId, $current)) {
                $plan->add('update', $label, $write, array_intersect_key($current->getAttributes(), $values));
            } else {
                $plan->same();
            }
        }

        if ($plan->created > 0) {
            $plan->warn('New shelf rows take the next free bins in the order of the file; an item already on a shelf keeps its bin');
        }

        return $plan;
    }
}
