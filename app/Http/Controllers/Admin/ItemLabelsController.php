<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\StoreVariant;
use App\Services\Admin\ActiveStore;
use App\Services\StorefrontCatalogService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * QR labels for item variants, to print and stick on shelves, bins and packs.
 *
 * Each label's QR holds the variant's barcode, or its SKU when it has none:
 * exactly what the stock keeper's scanner (ItemLookup::findVariant), the
 * stocktake count and the seller's item search look a scanned code up by.
 * With one store chosen, a label can carry that store's shelf price.
 */
class ItemLabelsController extends Controller
{
    /** One sheet holds at most this many items' variants. */
    public const MAX_ITEMS = 50;

    public function show(Request $request, ActiveStore $scope, StorefrontCatalogService $catalog): Response|RedirectResponse
    {
        $ids = collect(explode(',', (string) $request->query('items', '')))
            ->map(fn ($id) => (int) trim($id))
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->take(self::MAX_ITEMS)
            ->values();

        if ($ids->isEmpty()) {
            return redirect()->route('admin.items.index')->with('error', 'Choose the items to print labels for.');
        }

        $store = $scope->isAll() ? null : $scope->store();

        $items = Item::query()
            ->whereIn('id', $ids)
            ->with(['variants' => fn ($q) => $q->orderBy('id'), 'variants.itemColor', 'variants.itemSize', 'variants.itemPackagingType'])
            ->get()
            ->sortBy(fn (Item $item) => $ids->search($item->id))
            ->values();

        $storeVariants = $store === null ? collect() : StoreVariant::query()
            ->where('store_id', $store->id)
            ->whereIn('item_variant_id', $items->flatMap(fn (Item $item) => $item->variants->pluck('id')))
            ->get()
            ->keyBy('item_variant_id');

        return Inertia::render('Admin/Items/Labels', [
            'store' => $store ? ['id' => (int) $store->id, 'name' => (string) $store->name] : null,
            'items' => $items->map(fn (Item $item) => [
                'id' => (int) $item->id,
                'name' => (string) $item->product_name,
                'variants' => $item->variants->map(function (ItemVariant $variant) use ($storeVariants, $store, $catalog) {
                    $storeVariant = $storeVariants->get($variant->id);
                    $price = $store !== null && $storeVariant !== null ? $catalog->payablePrice($storeVariant, $store) : null;

                    return [
                        'id' => (int) $variant->id,
                        'label' => self::variantLabel($variant),
                        'sku' => $variant->sku,
                        'barcode' => $variant->barcode,
                        // What the QR holds: the code every scanner in the app looks up.
                        'code' => (string) ($variant->barcode ?: $variant->sku),
                        'price' => $price !== null && $price > 0 ? round($price, 2) : null,
                        'sold_here' => $storeVariant !== null && (bool) $storeVariant->active,
                    ];
                })->filter(fn (array $v) => $v['code'] !== '')->values()->all(),
            ])->all(),
        ]);
    }

    private static function variantLabel(ItemVariant $variant): string
    {
        $parts = array_filter([$variant->itemColor?->name, $variant->itemSize?->name, $variant->itemPackagingType?->name]);

        return $parts === [] ? 'Standard' : implode(' · ', $parts);
    }
}
