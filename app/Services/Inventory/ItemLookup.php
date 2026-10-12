<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Inventory\FloorArea;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Services\ImageResolver;

/**
 * What a stock keeper sees about an item: the catalogue data (read-only;
 * admin edits it), every image, where it sits, how much, its levels and its
 * floor areas. Never prices.
 *
 * Also resolves a scanned code (barcode first, then SKU) to a variant.
 */
class ItemLookup
{
    public function __construct(private readonly PackagingLadder $ladder)
    {
    }

    /** A scanned or typed code → the variant it names, or null. */
    public function findVariant(string $code): ?ItemVariant
    {
        $code = trim($code);

        if ($code === '') {
            return null;
        }

        return ItemVariant::query()->where('barcode', $code)->first()
            ?? ItemVariant::query()->where('sku', $code)->first();
    }

    /**
     * @param  array<int, int>|null  $scopeIds  locations the keeper sees; null = all
     * @return array<string, mixed>
     */
    public function detail(Item $item, ?array $scopeIds = null): array
    {
        $item->loadMissing([
            'category.parent',
            'packagingTypes',
            'variants.itemColor',
            'variants.itemSize',
            'variants.itemPackagingType',
            'variants.packagingQuantities',
            'variants.owner',
        ]);

        $itemId = (int) $item->id;
        $tiers = $this->ladder->forItem($itemId);

        return [
            'id' => $itemId,
            'name' => (string) $item->product_name,
            'description' => $item->product_description ?: $item->description,
            'packaging_details' => $item->packaging_details,
            'status' => (string) $item->status,
            'is_incomplete' => (bool) $item->is_incomplete,
            'category' => $this->categoryTrail($item),
            'images' => $this->images($item),
            'packaging' => collect($item->packagingTypes)->map(fn ($type): array => [
                'id' => (int) $type->id,
                'name' => (string) $type->name,
                'image' => $type->image ? ImageResolver::resolve((string) $type->image) : null,
                'pieces' => (int) ($type->pivot->quantity ?? $type->quantity ?? 1),
            ])->sortByDesc('pieces')->values()->all(),
            'variants' => $item->variants->map(fn (ItemVariant $v): array => [
                'id' => (int) $v->id,
                'sku' => $v->sku,
                'barcode' => $v->barcode,
                'status' => $v->status,
                'color' => $v->itemColor ? [
                    'name' => (string) $v->itemColor->name,
                    'image' => $v->itemColor->image_path ? ImageResolver::resolve((string) $v->itemColor->image_path) : null,
                ] : null,
                'size' => $v->itemSize?->name,
                'packaging' => $v->itemPackagingType ? [
                    'name' => (string) $v->itemPackagingType->name,
                    'image' => $v->itemPackagingType->image ? ImageResolver::resolve((string) $v->itemPackagingType->image) : null,
                    'pieces' => $this->ladder->piecesPerUnit((int) $v->id),
                ] : null,
                // CBM of one unit of each packaging this variant comes in.
                'volumes' => $v->packagingQuantities->map(fn ($p): array => [
                    'packaging' => (string) $p->name,
                    'quantity' => (int) $p->pivot->quantity,
                    'cbm' => $p->pivot->cbm !== null ? (float) $p->pivot->cbm : null,
                ])->values()->all(),
                'images' => collect(is_array($v->images) ? $v->images : (json_decode((string) $v->images, true) ?: []))
                    ->filter()->map(fn ($key): string => ImageResolver::resolve((string) $key))->values()->all(),
                'owner' => $v->owner?->name ?? null,
            ])->values()->all(),
            'stock' => $this->stock($itemId, $tiers, $scopeIds),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function stock(int $itemId, array $tiers, ?array $scopeIds): array
    {
        $rows = ItemStock::query()
            ->join('item_variants as iv', 'iv.id', '=', 'item_stocks.item_variant_id')
            ->where('iv.item_id', $itemId)
            ->whereNotNull('item_stocks.stock_location_id')
            ->when($scopeIds !== null, fn ($q) => $q->whereIn('item_stocks.stock_location_id', $scopeIds))
            ->get(['item_stocks.stock_location_id', 'item_stocks.item_variant_id', 'item_stocks.quantity', 'iv.sku'])
            ->groupBy('stock_location_id');

        $bands = ShelfItemBand::query()->where('item_id', $itemId)->get()->keyBy('stock_location_id');
        $areas = FloorArea::query()->whereHas('items', fn ($q) => $q->where('items.id', $itemId))->get()->groupBy('stock_location_id');

        $locationIds = $rows->keys()->merge($bands->keys())->merge($areas->keys())->unique()
            ->when($scopeIds !== null, fn ($c) => $c->intersect($scopeIds));
        $locations = StockLocation::query()->with('store:id,name')->whereIn('id', $locationIds)->get()->keyBy('id');

        return $locationIds->map(function ($id) use ($rows, $bands, $areas, $locations, $itemId, $tiers): ?array {
            $location = $locations->get($id);

            if ($location === null || $location->isTransit()) {
                return null;
            }

            $lines = $rows->get($id) ?? collect();
            $pieces = (int) $lines->sum(fn ($l): int => (int) $l->quantity * $this->ladder->piecesPerUnit((int) $l->item_variant_id));
            // The shelf is spoken in the smallest unit; everywhere else biggest first.
            $mode = $location->kind === StockLocation::KIND_SHELF ? 'smallest' : 'breakdown';
            $band = $bands->get($id);
            $unit = $band?->item_packaging_type_id !== null ? collect($tiers)->firstWhere('id', $band->item_packaging_type_id) : null;
            $unit ??= $mode === 'smallest' ? $this->ladder->smallestTier($itemId) : $this->ladder->largestTier($itemId);

            return [
                'location' => ['id' => (int) $location->id, 'name' => (string) $location->name, 'kind' => (string) $location->kind, 'store' => $location->store?->name],
                'pieces' => $pieces,
                'display' => $this->ladder->present($pieces, $itemId, $mode, $tiers)['label'],
                'by_sku' => $lines->map(fn ($l): array => ['sku' => $l->sku, 'quantity' => (int) $l->quantity])->values()->all(),
                'level' => $band ? ['max' => $band->max_units, 'low' => $band->refill_units, 'critical' => $band->critical_units, 'unit' => $unit['name']] : null,
                'areas' => ($areas->get($id) ?? collect())->map(fn (FloorArea $a): array => ['code' => (string) $a->code, 'name' => $a->name])->values()->all(),
            ];
        })->filter()->sortByDesc('pieces')->values()->all();
    }

    /** @return array<int, string> */
    private function images(Item $item): array
    {
        $general = is_array($item->general_images) ? $item->general_images : (json_decode((string) $item->general_images, true) ?: []);

        return collect($general)->filter()->map(fn ($key): string => ImageResolver::resolve((string) $key))->unique()->values()->all();
    }

    /** @return array<int, string> e.g. ["Stationery", "Pens"] */
    private function categoryTrail(Item $item): array
    {
        $trail = [];
        $category = $item->category;
        $guard = 0;

        while ($category !== null && $guard++ < 6) {
            array_unshift($trail, (string) $category->category_name);
            $category = $category->parent;
        }

        return $trail;
    }
}
