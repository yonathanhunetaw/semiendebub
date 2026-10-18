<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveItemBinRequest;
use App\Http\Requests\Admin\SaveItemPricesRequest;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
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
    ) {
    }

    public function show(Request $request, Item $item): Response
    {
        $item->load(['category.parent', 'variants.itemColor', 'variants.itemSize', 'variants.itemPackagingType']);
        $readiness = $this->readiness->for($item);
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
                    'barcode' => (string) ($v->barcode ?? ''),
                ])->values()->all(),
                'edit_url' => route('admin.items.edit', $item),
            ],
            'readiness' => $readiness,
            'stores' => $stores,
            'stock' => collect($places)->map(fn (array $p, int $id): array => ['location_id' => $id, 'place' => $p['name'], 'pieces' => $pieces[$id] ?? 0])->values()->all(),
            'history' => $this->history($item, $variantIds),
        ]);
    }

    public function savePrices(SaveItemPricesRequest $request, Item $item, Store $store): RedirectResponse
    {
        $rows = StoreVariant::query()->where('store_id', $store->id)->where('item_id', $item->id)->get()->keyBy('id');
        $saved = 0;

        DB::transaction(function () use ($request, $rows, &$saved): void {
            foreach ($request->validated('variants') as $line) {
                $row = $rows->get((int) $line['store_variant_id']);
                if ($row === null) {
                    throw new InvalidArgumentException('A price line does not belong to this item in this store.');
                }

                $matrix = (array) $row->pricing_matrix;
                $matrix = isset($matrix[0]) && is_array($matrix[0]) ? $matrix[0] : $matrix;
                $discount = $line['discount_price'] ?? null;
                $row->pricing_matrix = array_merge($matrix, [
                    'price' => (float) $line['price'],
                    'discount_price' => $discount === null || $discount === '' ? null : (float) $discount,
                    'discount_ends_at' => $discount === null || $discount === '' ? null : $line['discount_ends_at'],
                ]);
                $row->save();

                $individual = $line['individual_price'] ?? null;
                if ($individual === null || $individual === '') {
                    StoreVariantIndividualPrice::query()->where('store_variant_id', $row->id)->delete();
                } else {
                    StoreVariantIndividualPrice::query()->updateOrCreate(['store_variant_id' => $row->id], [
                        'pricing_matrix' => ['price' => (float) $individual, 'discount_price' => null, 'discount_ends_at' => null, 'auto_from_business' => false],
                        'active' => true,
                    ]);
                }
                $saved++;
            }
        });

        return back()->with('success', "Prices saved for {$store->name} ({$saved} variant".($saved === 1 ? '' : 's').').');
    }

    public function saveBin(SaveItemBinRequest $request, Item $item, StockLocation $location): RedirectResponse
    {
        abort_unless($this->permissions->canEditPlanogram($request->user(), $location), 403);

        try {
            $packaging = $request->validated('item_packaging_type_id') !== null ? (int) $request->validated('item_packaging_type_id') : null;
            $args = [$location, $item, $packaging, (int) $request->validated('max'), (int) $request->validated('refill'), (int) $request->validated('critical'), $request->user()];
            $location->kind === StockLocation::KIND_SHELF ? $this->matrix->setBand(...$args) : $this->levels->setLevel(...$args);
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['bin' => $e->getMessage()]);
        }

        return back()->with('success', "{$item->product_name}'s limits at {$location->name} saved.");
    }

    public function removeBin(Request $request, Item $item, StockLocation $location): RedirectResponse
    {
        abort_unless($this->permissions->canEditPlanogram($request->user(), $location), 403);

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
                'price' => $matrix['price'] ?? null,
                'discount_price' => $matrix['discount_price'] ?? null,
                'discount_ends_at' => $matrix['discount_ends_at'] ?? null,
                'individual_price' => ($individual->get($row->id)?->pricing_matrix['price'] ?? null),
            ];
        })->filter()->values()->all();

        $places = StockLocation::query()->where('store_id', $store->id)->whereIn('kind', [StockLocation::KIND_SHELF, StockLocation::KIND_REMOTE_HUB])->orderBy('id')->get();
        $bands = ShelfItemBand::query()->whereIn('stock_location_id', $places->pluck('id'))->where('item_id', $item->id)->get()->keyBy('stock_location_id');
        $people = $this->permissions->peopleOf((int) $store->id);

        return [
            'id' => (int) $store->id,
            'name' => (string) $store->name,
            'deployed' => $readiness !== null,
            'readiness' => $readiness,
            'lines' => $lines,
            'seller_prices' => StoreVariantSellerPrice::query()->whereIn('store_variant_id', $rows->pluck('id'))->count(),
            'customer_prices' => StoreVariantCustomerPrice::query()->whereIn('store_variant_id', $rows->pluck('id'))->count(),
            'prices_url' => $readiness === null ? null : route('store.item.variants', [$store->id, $item->id]),
            'places' => $places->map(function (StockLocation $place) use ($request, $bands, $people, $pieces): array {
                $band = $bands->get($place->id);

                return [
                    'location_id' => (int) $place->id,
                    'name' => (string) $place->name,
                    'kind' => (string) $place->kind,
                    'can_edit' => $this->permissions->canEditPlanogram($request->user(), $place),
                    'managers' => collect($people)->where('role', 'Manager')->pluck('name')->unique()->values()->all(),
                    'pieces' => $pieces[(int) $place->id] ?? 0,
                    'band' => $band === null ? null : ['max' => (int) $band->max_units, 'refill' => (int) $band->refill_units, 'critical' => (int) $band->critical_units],
                ];
            })->values()->all(),
            'count_url' => route('stock_keeper.stocktakes.index'),
        ];
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
