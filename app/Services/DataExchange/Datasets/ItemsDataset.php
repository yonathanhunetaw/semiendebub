<?php

declare(strict_types=1);

namespace App\Services\DataExchange\Datasets;

use App\Models\Auth\User;
use App\Models\Inventory\ItemStock;
use App\Models\Item\Item;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemVariant;
use App\Models\Procurement\Tariff;
use App\Services\DataExchange\CategoryPaths;
use App\Services\DataExchange\Dataset;
use App\Services\DataExchange\ImportPlan;
use App\Services\Item\ItemWriter;
use App\Services\Shared\CsvTable;
use Illuminate\Database\Eloquent\Model;

/**
 * Items: their basics and the colours × sizes × packaging they come in. The variants are not in the file:
 * they are generated from those lists, exactly as on the item setup page (ItemWriter::syncOptions). Barcodes
 * are the variants file; store prices and stock have their own files. Pictures are never imported.
 *
 *   - a row is matched by id; no id means a new item (and its name may not already be taken in that category)
 *   - a column left out of the file is not touched; one that is there but empty clears it
 *     (category and status are the exceptions: empty leaves them as they are)
 *   - colours and sizes are names separated by ";"; packaging is "Carton:12; Piece:1" (pieces per pack)
 *   - the names must already exist: add them in the Colours / Sizes / Packaging types files first
 *   - dropping an option removes the variants made from it, so that needs the "allow removals" tick, and a
 *     variant that still holds stock is never removed
 */
final class ItemsDataset extends Dataset
{
    private const STATUSES = ['draft', 'active', 'inactive', 'archived'];

    public function __construct(private readonly ItemWriter $writer)
    {
    }

    public function key(): string
    {
        return 'items';
    }

    public function label(): string
    {
        return 'Items';
    }

    public function group(): string
    {
        return 'Items';
    }

    public function description(): string
    {
        return 'Items with their category, HS code, status and the colours, sizes and packaging their variants are made from. Variants are generated, not typed.';
    }

    /** `variants` (how many exist now) is only there to read; an imported file may keep it, and it is ignored. */
    public function columns(): array
    {
        return ['id', 'product_name', 'category_path', 'hs_code', 'product_description', 'packaging_details', 'status', 'colors', 'sizes', 'packaging', 'variants'];
    }

    public function required(): array
    {
        return ['product_name'];
    }

    public function unique(): array
    {
        return ['id'];
    }

    public function maxRows(): int
    {
        return 1000;
    }

    public function options(): array
    {
        return ['allow_removals' => 'Allow removing variants (when a colour, size or packaging is dropped from an item)'];
    }

    public function example(): array
    {
        return ['', 'Round-neck T-shirt', 'Clothing > T-shirts', '6109.10', 'Cotton, short sleeve', '', 'draft', 'Red; Blue', 'S; M; L', 'Piece:1; Carton:12'];
    }

    public function importable(): bool
    {
        return true;
    }

    public function rows(): iterable
    {
        $paths = new CategoryPaths();
        $names = fn ($models): string => $models->pluck('name')->sort(SORT_NATURAL | SORT_FLAG_CASE)->implode('; ');

        $items = Item::query()->with(['colors', 'sizes', 'packagingTypes'])->withCount('variants')->lazyById(200);
        foreach ($items as $item) {
            yield [
                $item->id,
                $item->product_name,
                $paths->pathFor($item->item_category_id !== null ? (int) $item->item_category_id : null),
                $item->hs_code,
                $item->product_description,
                $item->packaging_details,
                $item->status,
                $names($item->colors),
                $names($item->sizes),
                $item->packagingTypes->sortBy('name')->map(fn ($type): string => $type->name.':'.(int) $type->pivot->quantity)->implode('; '),
                $item->variants_count,
            ];
        }
    }

    public function plan(CsvTable $table, User $by, array $options = []): ImportPlan
    {
        $plan = new ImportPlan();
        $have = array_flip($table->header);
        $allowRemovals = (bool) ($options['allow_removals'] ?? false);
        $paths = new CategoryPaths();
        [$colorMap, $colorKnown] = $this->names(ItemColor::class);
        [$sizeMap, $sizeKnown] = $this->names(ItemSize::class);
        [$typeMap, $typeKnown] = $this->names(ItemPackagingType::class);

        $ids = [];
        foreach ($table->rows as $row) {
            if (isset($have['id']) && ($id = $table->int($row, 'id')) !== null) {
                $ids[] = $id;
            }
        }
        $found = Item::query()->with(['colors', 'sizes', 'packagingTypes'])->whereIn('id', $ids)->get()->keyBy('id');
        $taken = null;
        $newNames = [];

        foreach ($table->rows as $row) {
            $line = $row['line'];
            $d = $row['data'];
            $bad = false;
            $fail = function (string $message) use ($table, $line, &$bad): void {
                $table->error($message, $line);
                $bad = true;
            };

            $name = $d['product_name'];
            if ($name === '' || mb_strlen($name) > 255) {
                $fail($name === '' ? 'product_name is empty' : 'product_name is longer than 255 characters');
            }

            $id = isset($have['id']) ? $table->int($row, 'id') : null;
            $item = $id !== null ? $found->get($id) : null;
            if ($id !== null && $item === null) {
                $fail("there is no item {$id}");
            }

            // category: needed for a new item; empty on an existing one leaves it as it is
            $categoryId = null;
            if (isset($have['category_path']) && $d['category_path'] !== '') {
                $categoryId = $paths->lookup($d['category_path']);
                if ($categoryId === null) {
                    $fail("unknown category '{$d['category_path']}' (like 'Parent > Child'; add it in Item categories first)");
                }
            }
            if ($id === null && $categoryId === null && ! $bad) {
                $fail('category_path is required for a new item');
            }

            $values = ['product_name' => $name];
            foreach (['product_description', 'packaging_details'] as $text) {
                if (isset($have[$text])) {
                    $values[$text] = $d[$text] === '' ? null : $d[$text];
                }
            }
            if (isset($have['hs_code'])) {
                if ($d['hs_code'] !== '' && (strlen($d['hs_code']) > 20 || ! preg_match('/^[0-9 .]+$/', $d['hs_code']))) {
                    $fail("hs_code '{$d['hs_code']}' may only have digits, dots and spaces (20 at most)");
                }
                $values['hs_code'] = Tariff::normalise($d['hs_code'] === '' ? null : $d['hs_code']);
            }
            if ($categoryId !== null) {
                $values['item_category_id'] = $categoryId;
            }

            $requested = null;
            if (isset($have['status']) && $d['status'] !== '') {
                $requested = mb_strtolower($d['status']);
                if (! in_array($requested, self::STATUSES, true)) {
                    $fail("status '{$d['status']}' must be one of ".implode(', ', self::STATUSES));
                }
            }

            // the options: a list left out of the file keeps what the item has
            $optionsGiven = isset($have['colors']) || isset($have['sizes']) || isset($have['packaging']);
            $colorIds = $item?->colors->pluck('id')->map(fn ($v): int => (int) $v)->all() ?? [];
            $sizeIds = $item?->sizes->pluck('id')->map(fn ($v): int => (int) $v)->all() ?? [];
            $packaging = $item?->packagingTypes->mapWithKeys(fn ($t): array => [(int) $t->id => (int) $t->pivot->quantity])->all() ?? [];

            if (isset($have['colors'])) {
                $colorIds = $this->nameIds($d['colors'], $colorMap, $colorKnown, 'colour', $fail);
            }
            if (isset($have['sizes'])) {
                $sizeIds = $this->nameIds($d['sizes'], $sizeMap, $sizeKnown, 'size', $fail);
            }
            if (isset($have['packaging'])) {
                $packaging = $this->packaging($d['packaging'], $typeMap, $typeKnown, $fail);
            }

            // duplicates: a name already taken in the category, or twice in this file
            if ($id === null && ! $bad) {
                $taken ??= $this->takenNames();
                $key = mb_strtolower($name).'|'.$categoryId;
                if (isset($taken[$key]) || isset($newNames[$key])) {
                    $fail("'{$name}' already exists in {$d['category_path']}"
                        .(isset($taken[$key]) ? " (item {$taken[$key]}: put its id on the line to change it)" : ' (twice in this file)'));
                }
                $newNames[$key] = true;
            }

            if ($bad) {
                continue;
            }

            // what the options do to the variants
            $optionsChanged = $item === null
                ? $optionsGiven
                : ($this->ids($colorIds) !== $this->ids($item->colors->pluck('id')->all())
                    || $this->ids($sizeIds) !== $this->ids($item->sizes->pluck('id')->all())
                    || $packaging != $item->packagingTypes->mapWithKeys(fn ($t): array => [(int) $t->id => (int) $t->pivot->quantity])->all());

            $note = '';
            if ($optionsChanged) {
                if ($item === null) {
                    $count = max(1, count($colorIds)) * max(1, count($sizeIds)) * max(1, count($packaging));
                    $note = " (+{$count} variants)";
                } else {
                    $p = $this->writer->previewVariants($item, $colorIds, $sizeIds, array_keys($packaging));
                    $note = ' ('.implode(', ', array_filter([$p['add'] ? "+{$p['add']} variants" : '', $p['restore'] ? "{$p['restore']} restored" : '', $p['remove'] ? "{$p['remove']} removed" : ''])).')';
                    if ($p['remove'] > 0 && ! $this->removable($item, $p['removing'], $allowRemovals, $table, $line, $name, $plan)) {
                        continue;
                    }
                }
            }

            $changed = $item === null
                || $optionsChanged
                || $this->differs($item, $values)
                || ($requested !== null && $requested !== $item->status);
            if (! $changed) {
                $plan->same();

                continue;
            }

            $label = $name.$note;
            $payload = array_map(fn (int $quantity): array => ['quantity' => $quantity], $packaging);

            if ($item === null) {
                $plan->add('create', $label, function () use ($values, $requested, $optionsGiven, $colorIds, $sizeIds, $payload): int {
                    // The setup page's order: the item, its requested status, then the options. The generator copies
                    // the item's status onto each new variant, so the status has to be in place before it runs.
                    $new = $this->writer->createFromData($values);
                    $this->writer->evaluateDraftStatus($new, $requested ?? 'draft');
                    if ($optionsGiven) {
                        $this->writer->syncOptions($new, $colorIds, $sizeIds, $payload);
                    }

                    return (int) $new->id;
                });

                continue;
            }

            $before = array_intersect_key($item->getAttributes(), $values + ['status' => 1]);
            $plan->add('update', $label, function () use ($item, $values, $requested, $optionsChanged, $colorIds, $sizeIds, $payload): int {
                // updateBasics writes every basic, so a column left out of the file keeps the item's own value.
                $this->writer->updateBasics($item, $values + [
                    'product_description' => $item->product_description,
                    'packaging_details' => $item->packaging_details,
                    'hs_code' => $item->hs_code,
                    'item_category_id' => $item->item_category_id,
                ]);
                $this->writer->evaluateDraftStatus($item, $requested ?? (string) $item->status);
                if ($optionsChanged) {
                    $this->writer->syncOptions($item, $colorIds, $sizeIds, $payload);
                }

                return (int) $item->id;
            }, $before);
        }

        return $plan;
    }

    /**
     * Whether the variants an item would lose may go. A variant holding stock never goes; the rest need the tick.
     *
     * @param  list<string>  $skus
     */
    private function removable(Item $item, array $skus, bool $allow, CsvTable $table, int $line, string $name, ImportPlan $plan): bool
    {
        $list = implode(', ', array_slice($skus, 0, 6)).(count($skus) > 6 ? ', …' : '');
        $variantIds = ItemVariant::query()->where('item_id', $item->id)->whereIn('sku', $skus)->pluck('id');

        if (ItemStock::query()->whereIn('item_variant_id', $variantIds)->where('quantity', '>', 0)->exists()) {
            $table->error("'{$name}' would lose variants that still hold stock ({$list}): count them down to zero first", $line);

            return false;
        }
        if (! $allow) {
            $table->error("'{$name}' would lose ".count($skus)." variants ({$list}): tick \"Allow removing variants\" if that is meant", $line);

            return false;
        }
        $plan->warn("'{$name}': ".count($skus)." variants are removed ({$list}) and their store variants switched off");

        return true;
    }

    /**
     * @param  class-string<Model>  $model
     * @return array{0: array<string, int>, 1: list<string>} lower-case name => id, and the names for a hint
     */
    private function names(string $model): array
    {
        $map = [];
        $known = [];
        foreach ($model::query()->orderBy('name')->get(['id', 'name']) as $row) {
            $map[mb_strtolower((string) $row->name)] = (int) $row->id;
            $known[] = (string) $row->name;
        }

        return [$map, $known];
    }

    /**
     * @param  array<string, int>  $map
     * @param  list<string>  $known
     * @return list<int>
     */
    private function nameIds(string $cell, array $map, array $known, string $what, callable $fail): array
    {
        $ids = [];
        foreach (array_filter(array_map('trim', explode(';', $cell)), fn (string $n): bool => $n !== '') as $name) {
            $id = $map[mb_strtolower($name)] ?? null;
            if ($id === null) {
                $fail("unknown {$what} '{$name}' (known: ".implode(', ', array_slice($known, 0, 12)).(count($known) > 12 ? ', …' : '').'; add it in the file for that first)');

                continue;
            }
            $ids[] = $id;
        }

        return array_values(array_unique($ids));
    }

    /**
     * @param  array<string, int>  $map
     * @param  list<string>  $known
     * @return array<int, int> packaging type id => pieces per pack
     */
    private function packaging(string $cell, array $map, array $known, callable $fail): array
    {
        $out = [];
        foreach (array_filter(array_map('trim', explode(';', $cell)), fn (string $n): bool => $n !== '') as $part) {
            if (! preg_match('/^(.+?)\s*:\s*(\d+)$/', $part, $m) || (int) $m[2] < 1) {
                $fail("packaging '{$part}' must look like Carton:12 (the pieces in one pack, at least 1)");

                continue;
            }
            $id = $map[mb_strtolower(trim($m[1]))] ?? null;
            if ($id === null) {
                $fail("unknown packaging '{$m[1]}' (known: ".implode(', ', array_slice($known, 0, 12)).(count($known) > 12 ? ', …' : '').')');

                continue;
            }
            $out[$id] = (int) $m[2];
        }
        ksort($out);

        return $out;
    }

    /** @return array<string, int> lower-case name|category id => item id, for the names already taken */
    private function takenNames(): array
    {
        $taken = [];
        foreach (Item::query()->get(['id', 'product_name', 'item_category_id']) as $item) {
            $taken[mb_strtolower((string) $item->product_name).'|'.$item->item_category_id] = (int) $item->id;
        }

        return $taken;
    }

    /**
     * @param  list<int|string>  $ids
     * @return list<int>
     */
    private function ids(array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        sort($ids);

        return $ids;
    }
}
