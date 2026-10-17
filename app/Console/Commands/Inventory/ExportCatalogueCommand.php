<?php

declare(strict_types=1);

namespace App\Console\Commands\Inventory;

use App\Models\Inventory\StockLocation;
use App\Services\Inventory\CatalogueSheet;
use App\Services\Inventory\PackagingLadder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Writes the catalogue as plain files, to sort out with an AI before real stock goes in:
 * every item with its category, variants, the stores that sell it and the pieces held at each
 * place, grouped by category, plus the instructions an AI needs to interview the owner.
 *
 * Read-only: it changes nothing in the database. The files hold items, categories and stock
 * only (no customers, staff, prices or passwords) and go to storage/app/exports, which git
 * ignores, so they never reach the repository.
 */
final class ExportCatalogueCommand extends Command
{
    /** @var string */
    protected $signature = 'catalogue:export {--dir= : Where to write (default storage/app/exports/catalogue)}';

    /** @var string */
    protected $description = 'Write the catalogue as CSV and Markdown files, with interview instructions for an AI (read-only)';

    public function handle(PackagingLadder $ladder, CatalogueSheet $sheet): int
    {
        $dir = (string) ($this->option('dir') ?: storage_path('app/exports/catalogue'));
        if (! is_dir($dir) && ! mkdir($dir, 0755, true) && ! is_dir($dir)) {
            $this->components->error("Cannot create {$dir}");

            return self::FAILURE;
        }

        $stores = $sheet->stores();

        $locations = $sheet->locations($stores);
        $categories = DB::table('item_categories')->get(['id', 'category_name', 'parent_id'])->keyBy('id');
        $path = function (?int $id) use ($categories): string {
            $names = [];
            for ($guard = 0; $id !== null && isset($categories[$id]) && $guard < 10; $guard++) {
                array_unshift($names, (string) $categories[$id]->category_name);
                $id = $categories[$id]->parent_id === null ? null : (int) $categories[$id]->parent_id;
            }

            return $names === [] ? '(no category)' : implode(' > ', $names);
        };

        $items = DB::table('items')->orderBy('product_name')->get(['id', 'product_name', 'item_category_id']);
        $variants = DB::table('item_variants')
            ->leftJoin('item_colors', 'item_colors.id', '=', 'item_variants.item_color_id')
            ->leftJoin('item_sizes', 'item_sizes.id', '=', 'item_variants.item_size_id')
            ->leftJoin('item_packaging_types', 'item_packaging_types.id', '=', 'item_variants.item_packaging_type_id')
            ->whereNull('item_variants.deleted_at')
            ->get(['item_variants.id', 'item_variants.item_id', 'item_colors.name as colour', 'item_sizes.name as size', 'item_packaging_types.name as packaging']);
        $variantsOf = $variants->groupBy('item_id');

        // Which stores sell each item: a store variant that is active.
        $soldIn = DB::table('store_variants')->where('active', true)->get(['item_id', 'store_id', 'item_variant_id'])
            ->groupBy('item_id')
            ->map(fn ($rows): array => $rows->groupBy('store_id')->map(fn ($r): int => $r->pluck('item_variant_id')->unique()->count())->all());

        // Pieces held per item per place (a carton counted as its pieces; see PackagingLadder).
        $perVariant = [];
        $pieces = [];
        $itemOfVariant = $variants->pluck('item_id', 'id');
        DB::table('item_stocks')->whereNotNull('stock_location_id')->whereIn('stock_location_id', array_keys($locations))
            ->get(['item_variant_id', 'stock_location_id', 'quantity'])
            ->each(function (object $row) use ($ladder, &$perVariant, &$pieces, $itemOfVariant): void {
                $variant = (int) $row->item_variant_id;
                $itemId = $itemOfVariant[$variant] ?? null;
                if ($itemId === null) {
                    return;
                }
                $perVariant[$variant] ??= max(1, $ladder->piecesPerUnit($variant));
                $pieces[(int) $itemId][(int) $row->stock_location_id] = ($pieces[(int) $itemId][(int) $row->stock_location_id] ?? 0)
                    + (int) $row->quantity * $perVariant[$variant];
            });

        $rows = [];
        foreach ($items as $item) {
            $itemId = (int) $item->id;
            $its = $variantsOf[$itemId] ?? collect();
            $distinct = fn (string $key): string => $its->pluck($key)->filter()->unique()->sort()->implode(', ');
            $sold = collect($soldIn[$itemId] ?? [])
                ->filter(fn ($count, $storeId): bool => isset($stores[$storeId]))
                ->map(fn ($count, $storeId): string => $stores[$storeId]->name.($count < $its->count() ? " ({$count} of {$its->count()} variants)" : ''))
                ->values()->all();

            $rows[] = [
                'id' => $itemId,
                'name' => (string) $item->product_name,
                'category' => $path($item->item_category_id === null ? null : (int) $item->item_category_id),
                'variants' => $its->count(),
                'packaging' => $distinct('packaging'),
                'colours' => $distinct('colour'),
                'sizes' => $distinct('size'),
                'sold_in' => $sold,
                'pieces' => $pieces[$itemId] ?? [],
            ];
        }

        $this->categoriesCsv($dir, $categories, $path, collect($rows)->countBy('category'));
        $this->itemsCsv($dir, $rows, $locations);
        $this->locationsCsv($dir, $locations);
        file_put_contents($dir.'/catalogue-for-ai.md', $this->catalogueMarkdown($rows, $locations, $stores->pluck('name')->all()));
        file_put_contents($dir.'/INTERVIEW.md', $this->interview(count($rows), $categories->count(), $categories->whereNull('parent_id')->count(), collect($rows)->pluck('category')->unique()->count(), $locations, $stores->pluck('name')->all()));

        $this->components->info('Written to '.$dir.' (git-ignored, read-only export):');
        $this->components->bulletList([
            'INTERVIEW.md             what to paste into the AI first',
            'catalogue-for-ai.md      the catalogue grouped by category, for the AI to read',
            'items.csv / categories.csv / locations.csv   the same as spreadsheets',
        ]);

        return self::SUCCESS;
    }

    private function csv(string $file, array $header, array $rows): void
    {
        $handle = fopen($file, 'w');
        fputcsv($handle, $header);
        foreach ($rows as $row) {
            fputcsv($handle, $row);
        }
        fclose($handle);
    }

    private function categoriesCsv(string $dir, $categories, \Closure $path, $itemCounts): void
    {
        $rows = $categories->map(fn (object $c): array => [
            $c->id, $c->category_name, $c->parent_id === null ? '' : ($categories[$c->parent_id]->category_name ?? ''), $path((int) $c->id), $itemCounts[$path((int) $c->id)] ?? 0,
        ])->sortBy(fn (array $r): string => $r[3])->values()->all();
        $this->csv($dir.'/categories.csv', ['id', 'name', 'parent', 'path', 'items'], $rows);
    }

    private function itemsCsv(string $dir, array $rows, array $locations): void
    {
        $header = ['item_id', 'item', 'category_path', 'variants', 'packaging', 'colours', 'sizes', 'sold_in', ...array_map(fn (array $l): string => 'pieces: '.$l['name'], array_values($locations))];
        $this->csv($dir.'/items.csv', $header, array_map(fn (array $r): array => [
            $r['id'], $r['name'], $r['category'], $r['variants'], $r['packaging'], $r['colours'], $r['sizes'], implode('; ', $r['sold_in']),
            ...array_map(fn (int $id): int => $r['pieces'][$id] ?? 0, array_keys($locations)),
        ], $rows));
    }

    private function locationsCsv(string $dir, array $locations): void
    {
        $this->csv($dir.'/locations.csv', ['id', 'name', 'kind', 'store'], array_map(fn (int $id): array => [$id, $locations[$id]['name'], $locations[$id]['kind'], $locations[$id]['store']], array_keys($locations)));
    }

    private function catalogueMarkdown(array $rows, array $locations, array $stores): string
    {
        $byCategory = collect($rows)->groupBy('category')->sortKeys();
        $md = "# Catalogue: ".count($rows)." items in {$byCategory->count()} categories (in use)\n\n"
            ."Stores: ".implode(', ', $stores)."\n\n";

        foreach ($byCategory as $category => $items) {
            $md .= "## {$category} · {$items->count()} item".($items->count() === 1 ? '' : 's')."\n";
            foreach ($items as $r) {
                $held = collect($r['pieces'])->filter(fn (int $p): bool => $p > 0)
                    ->map(fn (int $p, int $id): string => $locations[$id]['name'].' '.number_format($p))->values()->implode('; ');
                $md .= "- #{$r['id']} {$r['name']} — {$r['variants']} variants"
                    .($r['packaging'] !== '' ? " ({$r['packaging']})" : '')
                    .' — sold in: '.($r['sold_in'] === [] ? 'no store' : implode(', ', $r['sold_in']))
                    .' — stock (pieces): '.($held === '' ? 'none' : $held)."\n";
            }
            $md .= "\n";
        }

        return $md;
    }

    private function interview(int $itemCount, int $categoryCount, int $topLevel, int $usedCategories, array $locations, array $stores): string
    {
        $places = collect($locations)->map(fn (array $l): string => '- '.$l['name'].match ($l['kind']) {
            StockLocation::KIND_MAIN_HUB => ' (a warehouse)',
            StockLocation::KIND_REMOTE_HUB => ' (a separate stock room that feeds this store)',
            StockLocation::KIND_BACKROOM => ' (the store room behind the shop)',
            default => ' (the shelf customers see)',
        })->implode("\n");
        $storeList = implode(', ', $stores);

        return <<<MD
# Interview instructions (paste this first, then the catalogue file)

You are helping the owner of a stationery business (Duka, Addis Ababa, prices in ETB) tidy the catalogue before real
stock and real customers go in. The owner is not technical: use plain words and short questions, in whatever language
they answer in. You never decide for them; you propose and they agree or change it.

## What you have
`catalogue-for-ai.md`: {$itemCount} items, grouped by their current category. {$categoryCount} categories exist ({$topLevel} top-level) and
{$usedCategories} of them have items today. Some items sit in odd categories (a compass under paint brushes, colouring books under canvas):
that is part of what this interview should fix.
Each item line shows its id, name, how many variants it has (colour/size/packaging), the stores that sell it, and the
pieces held at each place today. Today almost everything is sold in every store and held everywhere: that was demo data,
not a real choice.

## The places (use these exact names)
Stores that sell items: {$storeList}.
Places that hold stock:
{$places}

## What to decide, in this order
1. **Categories.** Show the current category tree. Ask whether to keep it, rename, merge, split or move categories.
   Agree the final tree before anything else. New categories are allowed. Write them as `Parent > Child`.
2. **Items to categories.** Go category by category (not item by item). For each, say which items you think belong and
   ask for exceptions. Move an item only when the owner says so.
3. **Where each item lives.** Again category by category: propose a sensible default (for example "Pens: sold in all
   three stores; kept in Main Distribution Hub A, Main Store floor and shelf") and ask. Then ask about exceptions item
   by item. For each item decide (a) which stores sell it, (b) which places hold its stock.
4. **One policy question at the end:** the stock numbers today are placeholders. Should they be cleared (set to zero,
   recorded in the stock ledger) when real counts go in? Note the answer.

## How to ask
- One category at a time. Propose first, then ask "yes, or what should change?".
- Every 10 categories, show a short summary of what is agreed so far.
- Never invent items, stores or places; only use the names above. Never ask for passwords or keys (there are none here).
- Quantities are not part of this interview: real counts come later from a physical count.
- When every item is settled, show a final summary and ask for an explicit "yes, that is right". Only then produce the output.

## The output (when the owner says yes)
Produce `decisions.csv`, with exactly this header and one row for EVERY item (no item left out):

```
item_id,item,new_category_path,sold_in,stock_at,note
```

- `new_category_path`: `Parent > Child`, or `KEEP` to keep the current category.
- `sold_in`: store names separated by `;` (for example `Main Store;Online Store`), from the stores above.
- `stock_at`: place names separated by `;`, from the places above.
- `note`: anything the owner said about this item, or empty.

Also give a short list of the policy answers (for example "clear the placeholder stock: yes") and the final category tree.
MD."\n";
    }
}
