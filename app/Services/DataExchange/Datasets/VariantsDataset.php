<?php

declare(strict_types=1);

namespace App\Services\DataExchange\Datasets;

use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use App\Services\DataExchange\Dataset;
use App\Services\DataExchange\ImportPlan;
use App\Services\Item\ItemWriter;
use App\Services\Shared\CsvTable;

/**
 * An item's variants, as they were generated from its colours, sizes and packaging. Only the barcode can be
 * imported; the other columns say which variant a line is about and are checked, so a sheet made before the
 * options changed is refused instead of putting a code on the wrong variant. A line is found by its sku.
 *
 *   barcode  a code = set it   (4 to 32 letters, digits, dots, dashes; one live variant each, as on the item page)
 *            empty  = leave it as it is
 *            CLEAR  = remove it
 *            AUTO   = the shop's own EAN-13 code for this variant (the item page's "generate")
 */
final class VariantsDataset extends Dataset
{
    public function __construct(private readonly ItemWriter $writer)
    {
    }

    public function key(): string
    {
        return 'item_variants';
    }

    public function label(): string
    {
        return 'Variants and barcodes';
    }

    public function group(): string
    {
        return 'Items';
    }

    public function description(): string
    {
        return 'Every variant of every item. Importing changes barcodes only: a code, CLEAR to remove it, AUTO to generate the shop\'s own.';
    }

    public function columns(): array
    {
        return ['sku', 'barcode', 'item', 'colour', 'size', 'packaging', 'pieces_per_pack', 'item_id', 'variant_id', 'status'];
    }

    public function required(): array
    {
        return ['sku', 'barcode'];
    }

    public function unique(): array
    {
        return ['sku'];
    }

    public function example(): array
    {
        return ['DUKA-I1-C2-S3-P1', '6001234567890', 'Round-neck T-shirt', 'Red', 'M', 'Piece', 1, 1, 10, 'draft'];
    }

    public function importable(): bool
    {
        return true;
    }

    public function rows(): iterable
    {
        // Read by id only: an orderBy before lazyById makes its pages overlap and repeat rows.
        $variants = ItemVariant::query()->with(['item.packagingTypes', 'itemColor', 'itemSize', 'itemPackagingType'])->lazyById(300);
        foreach ($variants as $v) {
            $pack = $v->item?->packagingTypes->firstWhere('id', $v->item_packaging_type_id);

            yield [
                $v->sku,
                $v->barcode,
                $v->item?->product_name,
                $v->itemColor?->name,
                $v->itemSize?->name,
                $v->itemPackagingType?->name,
                $pack?->pivot->quantity,
                $v->item_id,
                $v->id,
                $v->status,
            ];
        }
    }

    public function plan(CsvTable $table, User $by, array $options = []): ImportPlan
    {
        $plan = new ImportPlan();
        $have = array_flip($table->header);

        $skus = array_values(array_filter(array_map(fn (array $row): string => $row['data']['sku'], $table->rows)));
        $variants = ItemVariant::query()->with(['item', 'itemColor', 'itemSize', 'itemPackagingType'])->whereIn('sku', $skus)->get()->keyBy('sku');

        /** @var array<int, array<int, string|null>> item id => variant id => code to save (null clears) */
        $codes = [];
        /** @var array<int, int> variant id => line */
        $lineOf = [];
        /** @var array<string, int> code => line, to catch one code on two variants in the file */
        $seen = [];
        /** @var list<array{variant: ItemVariant, kind: string, code: ?string}> */
        $writes = [];

        foreach ($table->rows as $row) {
            $line = $row['line'];
            $d = $row['data'];

            $variant = $d['sku'] === '' ? null : $variants->get($d['sku']);
            if ($variant === null) {
                $table->error($d['sku'] === '' ? 'sku is empty' : "there is no variant with sku '{$d['sku']}'", $line);

                continue;
            }

            if ($this->stale($table, $line, $variant, $d, $have)) {
                continue;
            }

            $cell = $d['barcode'];
            if ($cell === '') {
                $plan->same();

                continue;
            }

            $current = (string) ($variant->barcode ?? '');
            if (strcasecmp($cell, 'AUTO') === 0) {
                $current === '' ? $writes[] = ['variant' => $variant, 'kind' => 'auto', 'code' => null] : $plan->same();

                continue;
            }

            $code = strcasecmp($cell, 'CLEAR') === 0 ? null : $cell;
            if (($code ?? '') === $current) {
                $plan->same();

                continue;
            }
            if ($code !== null) {
                if (isset($seen[$code])) {
                    $table->error("barcode {$code} is already on line {$seen[$code]}", $line);

                    continue;
                }
                $seen[$code] = $line;
            }

            $codes[(int) $variant->item_id][(int) $variant->id] = $code;
            $lineOf[(int) $variant->id] = $line;
            $writes[] = ['variant' => $variant, 'kind' => 'set', 'code' => $code];
        }

        // The item page's own rules, one item at a time (format, the same code twice on an item, a code another variant uses).
        foreach ($codes as $itemId => $byVariant) {
            $item = $variants->first(fn (ItemVariant $v): bool => (int) $v->item_id === $itemId)?->item;
            foreach ($this->writer->barcodeErrors($item, $byVariant) as $key => $message) {
                $variantId = (int) substr($key, strlen('barcodes.'));
                $table->error($message, $lineOf[$variantId] ?? null);
            }
        }

        foreach ($writes as $w) {
            $variant = $w['variant'];
            $label = "{$variant->sku}: ".match ($w['kind']) {
                'auto' => 'generate a barcode',
                default => $w['code'] === null ? 'remove the barcode' : "barcode {$w['code']}",
            };

            $plan->add('update', $label, function () use ($variant, $w): int {
                $w['kind'] === 'auto'
                    ? $this->writer->generateBarcode($variant)
                    : $this->writer->saveBarcodes($variant->item, [$variant->id => $w['code'] ?? '']);

                return (int) $variant->id;
            }, ['sku' => $variant->sku, 'barcode' => $variant->barcode]);
        }

        return $plan;
    }

    /**
     * Whether the line describes a different variant from the one its sku names (the sheet is out of date).
     *
     * @param  array<string, string>  $d
     * @param  array<string, int>  $have
     */
    private function stale(CsvTable $table, int $line, ItemVariant $variant, array $d, array $have): bool
    {
        $checks = [
            'variant_id' => [(string) $variant->id, $d['variant_id'] ?? ''],
            'item_id' => [(string) $variant->item_id, $d['item_id'] ?? ''],
            'colour' => [(string) ($variant->itemColor?->name ?? ''), $d['colour'] ?? ''],
            'size' => [(string) ($variant->itemSize?->name ?? ''), $d['size'] ?? ''],
            'packaging' => [(string) ($variant->itemPackagingType?->name ?? ''), $d['packaging'] ?? ''],
        ];

        foreach ($checks as $column => [$actual, $given]) {
            if (isset($have[$column]) && mb_strtolower($actual) !== mb_strtolower($given)) {
                $table->error("{$variant->sku} is now {$column} '{$actual}', not '{$given}': download the file again", $line);

                return true;
            }
        }

        return false;
    }
}
