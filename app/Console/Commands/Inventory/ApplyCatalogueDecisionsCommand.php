<?php

declare(strict_types=1);

namespace App\Console\Commands\Inventory;

use App\Models\Inventory\StockReservation;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\CatalogueSheet;
use App\Services\Inventory\PackagingLadder;
use App\Services\StockService;
use Illuminate\Console\Command;
use Illuminate\Console\ConfirmableTrait;
use Illuminate\Support\Facades\DB;

/**
 * Applies the decisions.csv an AI interview with the owner produced (see catalogue:export):
 * which category each item belongs to, which stores sell it, and where its stock is held.
 *
 * Without --apply it only shows what would change and touches nothing. With --apply it
 * writes everything in one transaction and keeps a log of the old values next to the file.
 * Safe to run twice: the second run finds nothing left to change.
 *
 *   category      the item moves to the named category; new categories are created as needed
 *                 ("Parent > Child"); KEEP leaves it. Old categories are never deleted.
 *   sold_in       stores named here sell the item (their store variants are switched on);
 *                 real stores not named stop selling it (switched off). Store variants that do
 *                 not exist yet are reported, not invented: add them in Admin → Stores.
 *   stock_at      the places meant to hold the item. Stock sitting anywhere else is reported;
 *                 only with --clear-unlisted-stock is it set to zero, through the stock ledger
 *                 (a recorded adjustment, never raw SQL), skipping items with open reservations.
 *                 Quantities themselves are never invented: real counts come from a count.
 */
final class ApplyCatalogueDecisionsCommand extends Command
{
    use ConfirmableTrait;

    private const HEADER = ['item_id', 'item', 'new_category_path', 'sold_in', 'stock_at', 'note'];

    /** @var string */
    protected $signature = 'catalogue:apply
        {file : The decisions.csv from the AI interview}
        {--apply : Make the changes (without it nothing is changed, the changes are only shown)}
        {--clear-unlisted-stock : With --apply: set stock at places an item should not be held to zero, through the ledger}
        {--force : Skip the confirmation question in production}';

    /** @var string */
    protected $description = 'Apply the AI interview\'s decisions.csv: categories, stores and stock places (dry-run unless --apply)';

    /** @var array<int, array<string, int>> parent id (0 = top level) => lower-case name => category id */
    private array $tree = [];

    /** @var array<int, string> category id => name */
    private array $names = [];

    /** @var array<int, int> category id => parent id (0 = top level) */
    private array $parentOf = [];

    private int $pseudo = 0;

    /** @var list<string> paths of the categories that are created (or would be) */
    private array $created = [];

    public function handle(CatalogueSheet $sheet, PackagingLadder $ladder, StockService $stock): int
    {
        $apply = (bool) $this->option('apply');
        $clear = (bool) $this->option('clear-unlisted-stock');

        if ($clear && ! $apply) {
            $this->components->warn('--clear-unlisted-stock only acts together with --apply; this run only shows what it would do.');
        }

        $stores = $sheet->stores();
        $places = $sheet->locations($stores);
        [$rows, $errors] = $this->read((string) $this->argument('file'), $stores->pluck('name', 'id')->all(), array_map(fn (array $place): string => $place['name'], $places));

        if ($errors !== []) {
            $this->components->error('The file cannot be used, nothing was changed:');
            $this->components->bulletList(array_slice($errors, 0, 40));
            if (count($errors) > 40) {
                $this->line('  … and '.(count($errors) - 40).' more');
            }

            return self::FAILURE;
        }

        if ($apply && ! $this->confirmToProceed()) {
            return self::FAILURE;
        }

        $run = function () use ($rows, $stores, $places, $apply, $clear, $ladder, $stock): array {
            return $this->plan($rows, $stores->pluck('id', 'name')->all(), $places, $apply, $clear, $ladder, $stock);
        };
        $report = $apply ? DB::transaction($run) : $run();

        $this->show($report, $apply, $clear);

        if ($apply) {
            $log = storage_path('app/exports/catalogue/applied_'.now()->format('Ymd_His').'.json');
            if (! is_dir(dirname($log))) {
                mkdir(dirname($log), 0755, true);
            }
            file_put_contents($log, json_encode($report['log'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $this->components->info("Done. The old values are in {$log}");
        } else {
            $this->newLine();
            $this->components->info('Dry run: nothing was changed. Run again with --apply to make these changes.');
        }

        return self::SUCCESS;
    }

    /**
     * @param  array<int, string>  $stores  id => name
     * @param  array<int, string>  $places  id => name
     * @return array{0: list<array<string, mixed>>, 1: list<string>}
     */
    private function read(string $file, array $stores, array $places): array
    {
        if (! is_file($file)) {
            return [[], ["File not found: {$file}"]];
        }

        $handle = fopen($file, 'r');
        $header = fgetcsv($handle);
        if (is_array($header) && isset($header[0])) {
            $header[0] = ltrim((string) $header[0], "\xEF\xBB\xBF");
        }
        if ($header !== self::HEADER) {
            fclose($handle);

            return [[], ['The first line must be exactly: '.implode(',', self::HEADER)]];
        }

        $rows = [];
        $errors = [];
        $line = 1;
        $storeNames = array_flip(array_map('mb_strtolower', $stores));
        $placeNames = array_flip(array_map('mb_strtolower', $places));

        while (($cols = fgetcsv($handle)) !== false) {
            $line++;
            if ($cols === [null] || $cols === []) {
                continue;
            }
            if (count($cols) !== 6) {
                $errors[] = "Line {$line}: ".count($cols).' columns instead of 6 (a comma inside a value?)';

                continue;
            }
            [$id, $name, $category, $soldIn, $stockAt, $note] = array_map('trim', $cols);

            if (! ctype_digit($id)) {
                $errors[] = "Line {$line}: item_id '{$id}' is not a number";

                continue;
            }

            $segments = strcasecmp($category, 'KEEP') === 0 ? null : array_map('trim', explode('>', $category));
            if ($segments !== null && (in_array('', $segments, true) || count($segments) > 4)) {
                $errors[] = "Line {$line}: category '{$category}' must look like 'Parent > Child' (or KEEP)";
            }

            $storeIds = [];
            foreach (array_filter(array_map('trim', explode(';', $soldIn))) as $named) {
                isset($storeNames[mb_strtolower($named)])
                    ? $storeIds[] = $storeNames[mb_strtolower($named)]
                    : $errors[] = "Line {$line}: unknown store '{$named}' (known: ".implode(', ', $stores).')';
            }

            $placeIds = [];
            foreach (array_filter(array_map('trim', explode(';', $stockAt))) as $named) {
                isset($placeNames[mb_strtolower($named)])
                    ? $placeIds[] = $placeNames[mb_strtolower($named)]
                    : $errors[] = "Line {$line}: unknown place '{$named}' (known: ".implode(', ', $places).')';
            }

            $rows[] = ['line' => $line, 'id' => (int) $id, 'name' => $name, 'segments' => $segments, 'stores' => $storeIds, 'places' => $placeIds, 'note' => $note];
        }
        fclose($handle);

        $seen = [];
        foreach ($rows as $row) {
            if (isset($seen[$row['id']])) {
                $errors[] = "Line {$row['line']}: item {$row['id']} is already on line {$seen[$row['id']]}";
            }
            $seen[$row['id']] = $row['line'];
        }

        $known = Item::query()->whereIn('id', array_keys($seen))->pluck('product_name', 'id');
        foreach ($rows as $row) {
            if (! isset($known[$row['id']])) {
                $errors[] = "Line {$row['line']}: there is no item {$row['id']}";
            }
        }

        return [$rows, $errors];
    }

    /**
     * Works out everything and, with $apply, writes it (the caller wraps this in a transaction).
     *
     * @param  list<array<string, mixed>>  $rows
     * @param  array<string, int>  $storeIds  name => id
     * @param  array<int, array{name: string, kind: string, store: string}>  $places
     * @return array<string, mixed>
     */
    private function plan(array $rows, array $storeIds, array $places, bool $apply, bool $clear, PackagingLadder $ladder, StockService $stock): array
    {
        $this->loadCategories();
        $itemIds = array_column($rows, 'id');
        $items = Item::query()->whereIn('id', $itemIds)->get(['id', 'product_name', 'item_category_id'])->keyBy('id');
        $oldPath = fn (?int $id): string => $id === null || $id === 0 ? '(none)' : $this->path($id);

        // 1. Categories.
        $moves = [];
        $final = Item::query()->pluck('item_category_id', 'id')->map(fn ($id) => $id === null ? null : (int) $id)->all();
        foreach ($rows as $row) {
            if ($row['segments'] === null) {
                continue;
            }
            $target = $this->ensurePath($row['segments'], $apply);
            $item = $items[$row['id']];
            if ((int) $item->item_category_id === $target) {
                continue;
            }
            $moves[] = ['item_id' => $row['id'], 'item' => (string) $item->product_name, 'from_id' => $item->item_category_id === null ? null : (int) $item->item_category_id,
                'from' => $oldPath($item->item_category_id === null ? null : (int) $item->item_category_id), 'to_id' => $target, 'to' => implode(' > ', $row['segments'])];
            $final[$row['id']] = $target;
            if ($apply) {
                Item::query()->whereKey($row['id'])->update(['item_category_id' => $target]);
            }
        }

        // 2. Stores that sell each item.
        $storeChanges = [];
        $missing = [];
        $variantIds = ItemVariant::query()->whereIn('item_id', $itemIds)->get(['id', 'item_id'])->groupBy('item_id');
        $storeVariants = StoreVariant::query()->whereIn('item_id', $itemIds)->get(['id', 'item_id', 'store_id', 'active'])->groupBy('item_id');
        $storeNames = array_flip($storeIds);
        foreach ($rows as $row) {
            $have = ($storeVariants[$row['id']] ?? collect())->groupBy('store_id');
            foreach ($storeIds as $name => $storeId) {
                $mine = $have[$storeId] ?? collect();
                if (in_array($storeId, $row['stores'], true)) {
                    $off = $mine->where('active', false);
                    if ($off->isNotEmpty()) {
                        $storeChanges[] = ['item_id' => $row['id'], 'store' => $name, 'action' => 'sell', 'store_variants' => $off->pluck('id')->all()];
                        if ($apply) {
                            StoreVariant::query()->whereIn('id', $off->pluck('id'))->update(['active' => true]);
                        }
                    }
                    $short = ($variantIds[$row['id']] ?? collect())->count() - $mine->count();
                    if ($short > 0) {
                        $missing[] = "{$row['name']} (#{$row['id']}) in {$name}: {$short} variant(s) have no store variant";
                    }
                } else {
                    $on = $mine->where('active', true);
                    if ($on->isNotEmpty()) {
                        $storeChanges[] = ['item_id' => $row['id'], 'store' => $name, 'action' => 'stop selling', 'store_variants' => $on->pluck('id')->all()];
                        if ($apply) {
                            StoreVariant::query()->whereIn('id', $on->pluck('id'))->update(['active' => false]);
                        }
                    }
                }
            }
        }

        // 3. Stock held at places an item is not meant to be.
        $reserved = StockReservation::query()->where('status', StockReservation::STATUS_OPEN)->pluck('item_variant_id')->flip();
        $rowsByVariant = ItemStock::query()->whereIn('stock_location_id', array_keys($places))->where('quantity', '>', 0)
            ->get(['item_variant_id', 'stock_location_id', 'quantity'])->groupBy('item_variant_id');
        $elsewhere = [];
        $cleared = [];
        $skipped = [];
        foreach ($rows as $row) {
            foreach ($variantIds[$row['id']] ?? [] as $variant) {
                foreach ($rowsByVariant[$variant->id] ?? [] as $held) {
                    if (in_array((int) $held->stock_location_id, $row['places'], true)) {
                        continue;
                    }
                    $pieces = (int) $held->quantity * $ladder->piecesPerUnit((int) $variant->id);
                    $place = $places[(int) $held->stock_location_id]['name'];
                    $elsewhere[$place] ??= ['items' => [], 'pieces' => 0];
                    $elsewhere[$place]['items'][$row['id']] = true;
                    $elsewhere[$place]['pieces'] += $pieces;

                    if (! $clear) {
                        continue;
                    }
                    if (isset($reserved[$variant->id])) {
                        $skipped[] = "{$row['name']} (#{$row['id']}) variant {$variant->id}: open reservation, stock left as it is";

                        continue;
                    }
                    $cleared[] = ['item_id' => $row['id'], 'variant' => (int) $variant->id, 'place' => $place, 'location_id' => (int) $held->stock_location_id, 'units' => (int) $held->quantity];
                    if ($apply) {
                        $stock->adjust((int) $variant->id, (int) $held->stock_location_id, -(int) $held->quantity, [
                            'reason' => 'Catalogue tidy: not a stock place for this item',
                            'notes' => 'Placeholder stock cleared by catalogue:apply',
                            'user_id' => null,
                        ]);
                    }
                }
            }
        }

        // 4. Categories left with nothing in them.
        $inUse = [];
        foreach ($final as $categoryId) {
            for ($id = (int) $categoryId, $guard = 0; $id > 0 && $guard < 10; $id = $this->parentOf[$id] ?? 0, $guard++) {
                $inUse[$id] = true;
            }
        }
        $unused = [];
        foreach ($this->names as $id => $name) {
            if ($id > 0 && ! isset($inUse[$id])) {
                $unused[] = $this->path($id);
            }
        }
        sort($unused);

        return [
            'rows' => count($rows),
            'created_categories' => $this->created,
            'moves' => $moves,
            'kept' => count(array_filter($rows, fn (array $r): bool => $r['segments'] === null)),
            'store_changes' => $storeChanges,
            'missing_store_variants' => $missing,
            'elsewhere' => array_map(fn (array $e): array => ['items' => count($e['items']), 'pieces' => $e['pieces']], $elsewhere),
            'cleared' => $cleared,
            'skipped' => $skipped,
            'unused_categories' => $unused,
            'log' => ['created_categories' => $this->created, 'moves' => $moves, 'store_changes' => $storeChanges, 'cleared_stock' => $cleared],
        ];
    }

    private function loadCategories(): void
    {
        $this->tree = [];
        $this->names = [];
        $this->parentOf = [];
        $this->created = [];
        $this->pseudo = 0;

        foreach (ItemCategory::query()->get(['id', 'category_name', 'parent_id']) as $category) {
            $parent = (int) ($category->parent_id ?? 0);
            $this->tree[$parent][mb_strtolower(trim((string) $category->category_name))] ??= (int) $category->id;
            $this->names[(int) $category->id] = (string) $category->category_name;
            $this->parentOf[(int) $category->id] = $parent;
        }
    }

    /** The id of the category at this path, creating the missing levels (or pretending to, in a dry run). */
    private function ensurePath(array $segments, bool $create): int
    {
        $parent = 0;
        foreach ($segments as $depth => $segment) {
            $key = mb_strtolower($segment);
            if (! isset($this->tree[$parent][$key])) {
                $id = $create
                    ? (int) ItemCategory::query()->create(['category_name' => $segment, 'parent_id' => $parent === 0 ? null : $parent])->id
                    : --$this->pseudo;
                $this->tree[$parent][$key] = $id;
                $this->names[$id] = $segment;
                $this->parentOf[$id] = $parent;
                $this->created[] = implode(' > ', array_slice($segments, 0, $depth + 1));
            }
            $parent = $this->tree[$parent][$key];
        }

        return $parent;
    }

    private function path(int $id): string
    {
        $names = [];
        for ($guard = 0; $id > 0 || $id < 0; $guard++) {
            if (! isset($this->names[$id]) || $guard > 10) {
                break;
            }
            array_unshift($names, $this->names[$id]);
            $id = $this->parentOf[$id] ?? 0;
        }

        return implode(' > ', $names);
    }

    /** @param array<string, mixed> $r */
    private function show(array $r, bool $apply, bool $clear): void
    {
        $this->components->info(($apply ? 'Applied' : 'Would change').": {$r['rows']} items in the file");
        $this->components->twoColumnDetail('Items moved to another category', (string) count($r['moves']));
        $this->components->twoColumnDetail('Items whose category stays (KEEP or already right)', (string) ($r['rows'] - count($r['moves'])));
        $this->components->twoColumnDetail('New categories', (string) count($r['created_categories']));
        foreach ($r['created_categories'] as $path) {
            $this->line("    + {$path}");
        }

        $this->components->twoColumnDetail('Store variants switched on/off', (string) array_sum(array_map(fn (array $c): int => count($c['store_variants']), $r['store_changes'])));
        foreach (array_slice($r['missing_store_variants'], 0, 10) as $line) {
            $this->line("    ! {$line}");
        }
        if ($r['missing_store_variants'] !== []) {
            $this->line('    (items listed for a store that has no store variant for them: add them in Admin → Stores)');
        }

        $this->newLine();
        if ($r['elsewhere'] === []) {
            $this->components->twoColumnDetail('Stock held at places an item is not meant to be in', 'none');
        } else {
            $this->components->twoColumnDetail('Stock held at places an item is not meant to be in', $clear && $apply ? 'cleared through the ledger' : 'left as it is');
            foreach ($r['elsewhere'] as $place => $e) {
                $this->line(sprintf('    %-34s %4d items  %s pieces', $place, $e['items'], number_format($e['pieces'])));
            }
            if (! $clear) {
                $this->line('    (add --apply --clear-unlisted-stock to set these to zero, recorded in the stock ledger)');
            }
        }
        foreach (array_slice($r['skipped'], 0, 5) as $line) {
            $this->line("    ! {$line}");
        }

        $this->newLine();
        $this->components->twoColumnDetail('Categories with nothing in them afterwards (kept, not deleted)', (string) count($r['unused_categories']));
        foreach (array_slice($r['unused_categories'], 0, 25) as $path) {
            $this->line("    - {$path}");
        }
        if (count($r['unused_categories']) > 25) {
            $this->line('    … and '.(count($r['unused_categories']) - 25).' more (all in the log)');
        }

        if ($r['moves'] !== []) {
            $this->newLine();
            $this->line('  First moves:');
            foreach (array_slice($r['moves'], 0, 6) as $m) {
                $this->line("    #{$m['item_id']} {$m['item']}: {$m['from']}  →  {$m['to']}");
            }
        }
    }
}
