<?php

namespace App\Http\Controllers\Admin; // Moved from Admin\Inventory

use App\Http\Controllers\Controller;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    /**
     * Inventory operations hub.
     *
     * The counter tiles are the whole point of this screen, so every figure is
     * read from the database rather than sampled. The page it replaced
     * declared an `item` prop this method has never sent, so it tripped its own
     * `if (!item) return null` and rendered a blank page.
     */
    public function index(Request $request)
    {
        // Items and variants actually holding stock at each store, from the
        // positional ledger. `withCount('items')` was counting the item_store
        // pivot, which attaches the whole 182-item catalogue to every store
        // whether or not it has ever held one.
        $liveByStore = DB::table('item_stocks as s')
            ->join('item_variants as iv', 'iv.id', '=', 's.item_variant_id')
            ->where('s.location_type', Store::class)
            ->where('s.quantity', '>', 0)
            ->whereNull('iv.deleted_at')
            ->groupBy('s.location_id')
            ->selectRaw('s.location_id as store_id, COUNT(DISTINCT iv.item_id) as live_items, COUNT(DISTINCT iv.id) as live_variants, SUM(s.quantity) as units')
            ->get()
            ->keyBy('store_id');

        $stores = Store::query()
            ->orderBy('name')
            ->get()
            ->map(function (Store $store) use ($liveByStore): array {
                $live = $liveByStore->get($store->id);

                return [
                    'id' => (int) $store->id,
                    'name' => (string) $store->name,
                    'type' => $store->type ?? 'retail',
                    'location' => $store->location,
                    'location_code' => $store->location_code ?? 'LOC-' . $store->id,
                    // Items lead: a store is understood by what it sells, and
                    // a variant count says more about how the catalogue is cut
                    // than about the shop.
                    'live_items' => (int) ($live->live_items ?? 0),
                    'live_variants' => (int) ($live->live_variants ?? 0),
                    'units' => (int) ($live->units ?? 0),
                    'deployed_variants' => StoreVariant::where('store_id', $store->id)->count(),
                ];
            });

        return Inertia::render('Admin/Inventory/Index', [
            'stores' => $stores->values()->all(),
            'warehouses' => Warehouse::query()
                ->orderBy('name')
                ->get()
                ->map(fn (Warehouse $warehouse): array => [
                    'id' => (int) $warehouse->id,
                    'name' => (string) $warehouse->name,
                ])
                ->values()
                ->all(),
            'shipmentCounts' => $this->shipmentCounts(),
            'transferCounts' => $this->transferCounts(),
            'catalogue' => [
                'items' => Item::query()->count(),
                'deployed_variants' => StoreVariant::query()->count(),
            ],
            // Feeds the item picker. Only items a store actually carries can
            // open the per-location variant tool, so the list is scoped to
            // those rather than the full 182-item catalogue.
            'deployedItems' => $this->deployedItems(),
        ]);
    }

    /**
     * Shipment totals, one per filter the console actually accepts.
     *
     * Deliberately *not* grouped into friendly buckets. The board filters on a
     * single `?status=`, so a tile badge counting draft + pending_agreement
     * together would open a list showing a different number than the badge
     * that led there. Each figure here is the exact size of the list its tile
     * opens.
     *
     * @return array<string, int>
     */
    private function shipmentCounts(): array
    {
        $byStatus = Shipment::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $of = fn (string $status): int => (int) ($byStatus[$status] ?? 0);

        return [
            'all' => (int) $byStatus->sum(),
            'open' => (int) $byStatus->except(['received', 'cancelled'])->sum(),
            'draft' => $of('draft'),
            'pending_agreement' => $of('pending_agreement'),
            'scheduled' => $of('scheduled'),
            'picking' => $of('picking'),
            'ready' => $of('ready'),
            'dispatched' => $of('dispatched'),
            'in_transit' => $of('in_transit'),
            'delivered' => $of('delivered'),
            'received' => $of('received'),
            'cancelled' => $of('cancelled'),
            // Past its ETA and still moving. Computed rather than carried over
            // from the seller hub, which read `overdue` from a stats array
            // nothing populated.
            'overdue' => Shipment::query()
                ->whereNotNull('eta')
                ->where('eta', '<', now())
                ->whereNotIn('status', ['received', 'cancelled', 'delivered'])
                ->count(),
        ];
    }

    /** @return array<string, int> */
    private function transferCounts(): array
    {
        $byStatus = Transfer::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return [
            'all' => (int) $byStatus->sum(),
            'pending' => (int) ($byStatus['pending'] ?? 0),
            'in_transit' => (int) ($byStatus['in_transit'] ?? 0),
            'completed' => (int) ($byStatus['completed'] ?? 0),
            'cancelled' => (int) ($byStatus['cancelled'] ?? 0),
        ];
    }

    /**
     * Items that hold stock somewhere, with where that stock is.
     *
     * Driven by item_stocks, the positional ledger every other service reads.
     * The first version of this method summed `store_variants.stock`, a
     * denormalised column nothing maintains — all 29 rows of it are zero — and
     * joined through store_variants, which exists for store 1 only. So the
     * panel listed three items, all at Main Store, all reading 0 pcs, while
     * the ledger held 165,059 units across six stores and 1,443 more across
     * two warehouses.
     *
     * @return array<int, array<string, mixed>>
     */
    private function deployedItems(): array
    {
        $storeRows = DB::table('item_stocks as s')
            ->join('item_variants as iv', 'iv.id', '=', 's.item_variant_id')
            ->join('items as i', 'i.id', '=', 'iv.item_id')
            ->join('stores as st', 'st.id', '=', 's.location_id')
            ->where('s.location_type', Store::class)
            ->whereNull('iv.deleted_at')
            ->groupBy('i.id', 'i.product_name', 'st.id', 'st.name', 'st.type')
            // `type` travels with the row because this application models its
            // warehouses twice: as rows in `stores` with a warehouse type, and
            // again in the `warehouses` table. Without it the picker labels
            // "Warehouse A" a store.
            ->selectRaw('i.id as item_id, i.product_name, st.id as store_id, st.name as store_name, st.type as store_type, COUNT(DISTINCT iv.id) as variants, SUM(s.quantity) as stock')
            ->get();

        $warehouseRows = DB::table('item_stocks as s')
            ->join('item_variants as iv', 'iv.id', '=', 's.item_variant_id')
            ->join('items as i', 'i.id', '=', 'iv.item_id')
            ->join('warehouses as w', 'w.id', '=', 's.location_id')
            ->where('s.location_type', Warehouse::class)
            ->whereNull('iv.deleted_at')
            ->groupBy('i.id', 'w.id', 'w.name')
            ->selectRaw('i.id as item_id, w.id as warehouse_id, w.name as warehouse_name, SUM(s.quantity) as stock')
            ->get()
            ->groupBy('item_id');

        return $storeRows
            ->groupBy('item_id')
            ->map(function (Collection $group, $itemId) use ($warehouseRows): array {
                $stores = $group
                    // Busiest shelf first: an admin opening this is looking for
                    // where the stock is, not for alphabetical order.
                    ->sortByDesc('stock')
                    ->map(fn ($row): array => [
                        'id' => (int) $row->store_id,
                        'name' => (string) $row->store_name,
                        'type' => (string) ($row->store_type ?? 'retail'),
                        'variants' => (int) $row->variants,
                        'stock' => (int) $row->stock,
                    ])
                    ->values()
                    ->all();

                $warehouses = $warehouseRows->get($itemId, collect())
                    ->sortByDesc('stock')
                    ->map(fn ($row): array => [
                        'id' => (int) $row->warehouse_id,
                        'name' => (string) $row->warehouse_name,
                        'stock' => (int) $row->stock,
                    ])
                    ->values()
                    ->all();

                return [
                    'id' => (int) $itemId,
                    'name' => (string) $group->first()->product_name,
                    'variants' => (int) $group->max('variants'),
                    'store_stock' => (int) $group->sum('stock'),
                    'warehouse_stock' => (int) collect($warehouses)->sum('stock'),
                    'stores' => $stores,
                    'warehouses' => $warehouses,
                ];
            })
            ->sortByDesc('store_stock')
            ->values()
            ->all();
    }
}
