<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveItemBinRequest;
use App\Http\Requests\Admin\SaveItemPricesRequest;
use App\Http\Requests\Admin\SaveItemSpotRequest;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemSize;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantIndividualPrice;
use App\Models\Store\StoreVariantSellerPrice;
use App\Services\Inventory\CatalogueSheet;
use App\Services\Inventory\LocationLevels;
use App\Services\Inventory\PackagingLadder;
use App\Services\Inventory\ShelfMatrix;
use App\Services\Inventory\StockPermissions;
use App\Services\Item\ItemReadiness;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

/**
 * Admin → Items → an item → Setup: everything that makes an item ready on one page, with a
 * percentage per part. Each part saves on its own (Inertia requests that come back to this page),
 * and the rules are the existing ones: prices as the Stores page saves them, shelf limits through
 * ShelfMatrix / LocationLevels and only for whoever StockPermissions allows, stock only through counts.
 */
final class ItemSetupController extends Controller
{
    public function __construct(
        private readonly ItemReadiness $readiness,
        private readonly CatalogueSheet $sheet,
        private readonly StockPermissions $permissions,
        private readonly ShelfMatrix $matrix,
        private readonly LocationLevels $levels,
        private readonly PackagingLadder $ladder,
        private readonly \App\Services\Item\ItemWriter $writer,
        private readonly \App\Services\Item\ItemPlaces $places,
        private readonly \App\Services\Item\StorePrices $prices,
    ) {
    }

    public function show(Request $request, Item $item): Response
    {
        $item->load(['category.parent', 'colors', 'sizes', 'packagingTypes' => fn ($q) => $q->withPivot('quantity'), 'variants.itemColor', 'variants.itemSize', 'variants.itemPackagingType']);
        $readiness = $this->readiness->refresh($item);
        $variantIds = $item->variants->pluck('id')->all();
        $places = $this->sheet->locations();

        // Pieces of the item at every place (a carton counted as its pieces).
        $pieces = [];
        ItemStock::query()->whereIn('item_variant_id', $variantIds)->whereIn('stock_location_id', array_keys($places))
            ->get(['item_variant_id', 'stock_location_id', 'quantity'])
            ->each(function (ItemStock $row) use (&$pieces): void {
                $pieces[(int) $row->stock_location_id] = ($pieces[(int) $row->stock_location_id] ?? 0)
                    + (int) $row->quantity * $this->ladder->piecesPerUnit((int) $row->item_variant_id);
            });

        $stores = $this->sheet->stores()->map(fn (object $store): array => $this->storePayload($request, $item, Store::query()->findOrFail($store->id), $readiness['stores'][$store->id] ?? null, $pieces))->values()->all();

        return Inertia::render('Admin/Items/Setup', [
            'item' => [
                'id' => $item->id,
                'name' => (string) $item->product_name,
                'category' => $item->category === null ? null : trim(($item->category->parent?->category_name ? $item->category->parent->category_name.' > ' : '').$item->category->category_name),
                'status' => (string) $item->status,
                'variants' => $item->variants->map(fn ($v): array => [
                    'id' => $v->id,
                    'sku' => (string) $v->sku,
                    'label' => collect([$v->itemColor?->name, $v->itemSize?->name, $v->itemPackagingType?->name])->filter()->implode(' / '),
                    'status' => (string) $v->status,
                    'barcode' => (string) ($v->barcode ?? ''),
                    'slots' => collect($v->image_slots)->pad(5, null)->take(5)->values()->all(),
                ])->values()->all(),
                'basics' => [
                    'product_name' => (string) $item->product_name,
                    'product_description' => (string) ($item->product_description ?? ''),
                    'packaging_details' => (string) ($item->packaging_details ?? ''),
                    'hs_code' => (string) ($item->hs_code ?? ''),
                    'item_category_id' => $item->item_category_id,
                    'status' => (string) $item->status,
                    'pictures' => collect($item->general_images ?? [])->map(fn ($p): array => ['path' => (string) $p, 'url' => \App\Services\ImageResolver::resolve((string) $p)])->values()->all(),
                ],
            ],
            'options' => [
                'colors' => $item->colors->map(fn ($c): array => ['id' => $c->id, 'name' => $c->name])->values()->all(),
                'sizes' => $item->sizes->map(fn ($c): array => ['id' => $c->id, 'name' => $c->name])->values()->all(),
                'packaging' => $item->packagingTypes->map(fn ($p): array => ['id' => $p->id, 'name' => $p->name, 'quantity' => (int) $p->pivot->quantity])->values()->all(),
            ],
            'catalog' => [
                'categories' => $this->writer->categoryOptions(),
                'colors' => ItemColor::query()->orderBy('name')->get(['id', 'name'])->map(fn ($o): array => ['id' => $o->id, 'name' => $o->name])->all(),
                'sizes' => ItemSize::query()->orderBy('name')->get(['id', 'name'])->map(fn ($o): array => ['id' => $o->id, 'name' => $o->name])->all(),
                'packaging' => ItemPackagingType::query()->orderBy('name')->get(['id', 'name'])->map(fn ($o): array => ['id' => $o->id, 'name' => $o->name])->all(),
            ],
            'readiness' => $readiness,
            'stores' => $stores,
            // The newest price changes of this item in the stores on this page.
            'priceHistory' => app(\App\Services\Item\PriceHistory::class)->forItem((int) $item->id, $this->sheet->stores()->pluck('id')->map(fn ($id): int => (int) $id)->all()),
            'warehouses' => $this->places->warehouses($item, $request->user()),
            'stock' => collect($places)->map(fn (array $p, int $id): array => ['location_id' => $id, 'place' => $p['name'], 'pieces' => $pieces[$id] ?? 0])->values()->all(),
            'history' => $this->history($item, $variantIds),
        ]);
    }

    public function savePrices(SaveItemPricesRequest $request, Item $item, Store $store): RedirectResponse
    {
        $saved = $this->prices->saveBase($store, $item, $request->validated('variants'));

        return back()->with('success', "Prices saved for {$store->name} ({$saved} variant".($saved === 1 ? '' : 's').').');
    }

    public function saveBin(SaveItemBinRequest $request, Item $item, StockLocation $location): RedirectResponse
    {
        abort_unless($this->places->canEdit($request->user(), $location), 403);

        try {
            $packaging = $request->validated('item_packaging_type_id') !== null ? (int) $request->validated('item_packaging_type_id') : null;
            $args = [$location, $item, $packaging, (int) $request->validated('max'), (int) $request->validated('refill'), (int) $request->validated('critical'), $request->user()];
            $location->kind === StockLocation::KIND_SHELF ? $this->matrix->setBand(...$args) : $this->levels->setLevel(...$args);
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['bin' => $e->getMessage()]);
        }

        return back()->with('success', "{$item->product_name}'s limits at {$location->name} saved.");
    }

    /** Put the item's shelf bin on a slot of the racks, or lift it off (an empty slot). The world's racks view calls this too. */
    public function saveSpot(SaveItemSpotRequest $request, Item $item, StockLocation $location): RedirectResponse
    {
        abort_unless($location->kind === StockLocation::KIND_SHELF && $this->places->canEdit($request->user(), $location), 403);

        try {
            $slot = $request->validated('spot');
            if ($slot === null || trim($slot) === '') {
                $this->matrix->clearSlot($location, $item, $request->user());

                return back()->with('success', "{$item->product_name} is off its slot.");
            }
            $placed = $this->matrix->placeOnSlot($location, $item, $slot, $request->user());
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['spot' => $e->getMessage()]);
        }

        return back()->with('success', "{$item->product_name} is on {$placed['band']->spot}.".($placed['swapped'] ? " {$placed['swapped']} took its old place." : ''));
    }

    public function removeBin(Request $request, Item $item, StockLocation $location): RedirectResponse
    {
        abort_unless($this->places->canEdit($request->user(), $location), 403);

        try {
            $location->kind === StockLocation::KIND_SHELF ? $this->matrix->removeBand($location, $item) : $this->levels->removeLevel($location, $item);
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "{$item->product_name} is off {$location->name}'s planogram.");
    }

    /**
     * @param  array<string, mixed>|null  $readiness  null when the store has none of the item yet
     * @param  array<int, int>  $pieces
     * @return array<string, mixed>
     */
    private function storePayload(Request $request, Item $item, Store $store, ?array $readiness, array $pieces): array
    {
        $rows = StoreVariant::query()->where('store_id', $store->id)->where('item_id', $item->id)->get()->keyBy('item_variant_id');
        $individual = StoreVariantIndividualPrice::query()->whereIn('store_variant_id', $rows->pluck('id'))->get()->keyBy('store_variant_id');

        $lines = $item->variants->map(function ($v) use ($rows, $individual): ?array {
            $row = $rows->get($v->id);
            if ($row === null) {
                return null;
            }
            $matrix = (array) $row->pricing_matrix;
            $matrix = isset($matrix[0]) && is_array($matrix[0]) ? $matrix[0] : $matrix;

            return [
                'store_variant_id' => $row->id,
                'variant' => collect([$v->itemColor?->name, $v->itemSize?->name, $v->itemPackagingType?->name])->filter()->implode(' / ') ?: (string) $v->sku,
                'sku' => (string) $v->sku,
                'active' => (bool) $row->active,
                'on_sale' => (bool) $row->active,
                'forced_off' => $row->manual_status === 'forced',
                'business_pool' => $row->business_pool,
                'price' => $matrix['price'] ?? null,
                'discount_price' => $matrix['discount_price'] ?? null,
                'discount_ends_at' => $matrix['discount_ends_at'] ?? null,
                'individual_price' => ($individual->get($row->id)?->pricing_matrix['price'] ?? null),
            ];
        })->filter()->values()->all();

        $where = $this->places->forStore($item, $store, $request->user());

        return [
            'id' => (int) $store->id,
            'name' => (string) $store->name,
            'deployed' => $readiness !== null,
            'readiness' => $readiness,
            'lines' => $lines,
            'seller_prices' => $this->sellerEntries($rows->pluck('id')->all(), $lines),
            'customer_prices' => $this->customerEntries($rows->pluck('id')->all(), $lines),
            'sellers' => User::query()->visibleTo(auth()->user())->where('store_id', $store->id)->where('role', 'seller')->orderBy('first_name')->get(['id', 'first_name', 'last_name'])
                ->map(fn (User $u): array => ['id' => (int) $u->id, 'name' => trim($u->first_name.' '.$u->last_name)])->all(),
            'prices_url' => $readiness === null ? null : route('store.item.variants', [$store->id, $item->id]),
            'places' => $where['places'],
            'route' => $where['route'],
            'count_url' => route('stock_keeper.stocktakes.index'),
        ];
    }

    /**
     * One entry per seller and tier with a price on this item in the store, a line per variant.
     *
     * @param  list<int>  $storeVariantIds
     * @param  list<array<string, mixed>>  $lines  the store's variants, in order
     * @return list<array<string, mixed>>
     */
    private function sellerEntries(array $storeVariantIds, array $lines): array
    {
        $records = StoreVariantSellerPrice::query()->whereIn('store_variant_id', $storeVariantIds)->with('seller:id,first_name,last_name')->get()->groupBy('seller_id');
        $entries = [];

        foreach ($records as $sellerId => $rows) {
            $byVariant = $rows->keyBy('store_variant_id');
            foreach (['business', 'individual'] as $type) {
                $tiers = $byVariant->map(function ($r) use ($type) {
                    $m = (array) $r->pricing_matrix;
                    $legacy = ! isset($m['business']) && ! isset($m['individual']) && $m !== [];

                    return $m[$type] ?? ($legacy && $type === 'business' ? $m : null);
                })->filter();
                if ($tiers->isEmpty()) {
                    continue;
                }
                $entries[] = [
                    'seller_id' => (int) $sellerId,
                    'name' => trim(($rows->first()->seller?->first_name ?? '').' '.($rows->first()->seller?->last_name ?? '')),
                    'customer_type' => $type,
                    'lines' => array_map(fn (array $l): array => ['store_variant_id' => $l['store_variant_id']] + $this->tierLine($tiers->get($l['store_variant_id'])), $lines),
                ];
            }
        }

        return $entries;
    }

    /** @return list<array<string, mixed>> */
    private function customerEntries(array $storeVariantIds, array $lines): array
    {
        $records = StoreVariantCustomerPrice::query()->whereIn('store_variant_id', $storeVariantIds)->with('customer:id,name,tin_number')->get()->groupBy('customer_id');

        return $records->map(function ($rows, $customerId) use ($lines): array {
            $byVariant = $rows->keyBy('store_variant_id');
            $customer = $rows->first()->customer;

            return [
                'customer_id' => (int) $customerId,
                'name' => (string) ($customer?->name ?? "Customer #{$customerId}"),
                'customer_type' => $customer?->tin_number ? 'individual' : 'business',
                'lines' => array_map(fn (array $l): array => ['store_variant_id' => $l['store_variant_id']] + $this->tierLine($byVariant->get($l['store_variant_id'])?->pricing_matrix), $lines),
            ];
        })->values()->all();
    }

    /** @return array{price: mixed, discount_price: mixed, discount_ends_at: mixed} */
    private function tierLine(mixed $tier): array
    {
        $tier = (array) $tier;

        return ['price' => $tier['price'] ?? null, 'discount_price' => $tier['discount_price'] ?? null, 'discount_ends_at' => $tier['discount_ends_at'] ?? null];
    }

    /**
     * What has happened to the item: its latest transfers, shipments, stock movements and sales.
     *
     * @param  list<int>  $variantIds
     * @return array<string, list<array<string, mixed>>>
     */
    private function history(Item $item, array $variantIds): array
    {
        return [
            'transfers' => Transfer::query()->whereIn('item_variant_id', $variantIds)->latest('id')->limit(10)->get(['reference', 'quantity', 'status', 'created_at'])
                ->map(fn ($t): array => ['reference' => (string) $t->reference, 'quantity' => (int) $t->quantity, 'status' => (string) $t->status, 'at' => $t->created_at?->toDateTimeString()])->all(),
            'shipments' => DB::table('shipment_items')->join('shipments', 'shipments.id', '=', 'shipment_items.shipment_id')
                ->whereIn('shipment_items.item_variant_id', $variantIds)->orderByDesc('shipments.id')->limit(10)
                ->get(['shipments.reference', 'shipment_items.quantity', 'shipments.status', 'shipments.created_at'])
                ->map(fn (object $s): array => ['reference' => (string) $s->reference, 'quantity' => (int) $s->quantity, 'status' => (string) $s->status, 'at' => (string) $s->created_at])->all(),
            'movements' => DB::table('inventory_movements')->leftJoin('stock_locations', 'stock_locations.id', '=', 'inventory_movements.stock_location_id')
                ->whereIn('item_variant_id', $variantIds)->orderByDesc('inventory_movements.id')->limit(15)
                ->get(['inventory_movements.type', 'inventory_movements.reason', 'inventory_movements.quantity', 'stock_locations.name as place', 'inventory_movements.created_at'])
                ->map(fn (object $m): array => ['type' => (string) $m->type, 'reason' => (string) $m->reason, 'quantity' => (int) $m->quantity, 'place' => (string) $m->place, 'at' => (string) $m->created_at])->all(),
            'sales' => DB::table('sale_items')->join('sales', 'sales.id', '=', 'sale_items.sale_id')
                ->join('store_variants', 'store_variants.id', '=', 'sale_items.store_variant_id')
                ->whereIn('store_variants.item_variant_id', $variantIds)->orderByDesc('sales.id')->limit(10)
                ->get(['sales.reference_number', 'sale_items.quantity', 'sales.fulfillment_stage', 'sales.created_at'])
                ->map(fn (object $s): array => ['reference' => (string) $s->reference_number, 'quantity' => (int) $s->quantity, 'status' => (string) $s->fulfillment_stage, 'at' => (string) $s->created_at])->all(),
        ];
    }
}
