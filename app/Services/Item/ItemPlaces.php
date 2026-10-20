<?php

declare(strict_types=1);

namespace App\Services\Item;

use App\Models\Auth\User;
use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\Stocktake;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Services\Inventory\LocationLevels;
use App\Services\Inventory\PackagingLadder;
use App\Services\Inventory\RefillEngine;
use App\Services\Inventory\StockPermissions;

/**
 * Where an item can be held and what is set for it there, for the item setup page: for each place its
 * limits (a shelf bin, or a level at the floor / Remote Hub / a warehouse), who may change them, the pieces
 * held now, and the count in progress; and a store's refill route. Reads only.
 */
final class ItemPlaces
{
    public function __construct(
        private readonly StockPermissions $permissions,
        private readonly LocationLevels $levels,
        private readonly RefillEngine $refills,
        private readonly PackagingLadder $ladder,
    ) {
    }

    /** May this person change the item's limits at this place? Shelf: the planogram rule; floor, Remote Hub, warehouse: the levels rule. */
    public function canEdit(?User $user, StockLocation $place): bool
    {
        return $place->kind === StockLocation::KIND_SHELF
            ? $this->permissions->canEditPlanogram($user, $place)
            : $this->levels->canEdit($user, $place, null);
    }

    /** @return array{places: list<array<string, mixed>>, route: array<string, mixed>} */
    public function forStore(Item $item, Store $store, ?User $user): array
    {
        $places = StockLocation::query()->where('store_id', $store->id)
            ->whereIn('kind', [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM, StockLocation::KIND_REMOTE_HUB])
            ->orderByRaw("CASE kind WHEN 'shelf' THEN 1 WHEN 'backroom' THEN 2 ELSE 3 END")->orderBy('id')->get();
        $people = $this->permissions->peopleOf((int) $store->id);

        return [
            'places' => $this->describe($item, $places->all(), $user, $people),
            'route' => [
                'sources' => $this->refills->routeFor((int) $store->id, (int) $item->id),
                'set' => ItemRefillRoute::query()->where('store_id', $store->id)->where('item_id', $item->id)->exists(),
                'can_edit' => $this->permissions->canSetRefillRoute($user, (int) $store->id),
                'managers' => collect($people)->where('role', 'Manager')->pluck('name')->unique()->values()->all(),
                'available' => ItemRefillRoute::SOURCES,
            ],
        ];
    }

    /** The main warehouses (not any one store's). @return list<array<string, mixed>> */
    public function warehouses(Item $item, ?User $user): array
    {
        return $this->describe($item, StockLocation::query()->where('kind', StockLocation::KIND_MAIN_HUB)->orderBy('id')->get()->all(), $user, []);
    }

    /**
     * @param  list<StockLocation>  $places
     * @param  array<int, array<string, mixed>>  $people
     * @return list<array<string, mixed>>
     */
    private function describe(Item $item, array $places, ?User $user, array $people): array
    {
        $ids = array_map(fn (StockLocation $p): int => (int) $p->id, $places);
        $bands = ShelfItemBand::query()->whereIn('stock_location_id', $ids)->where('item_id', $item->id)->get()->keyBy('stock_location_id');
        $variantIds = $item->variants->pluck('id')->all();
        $stock = ItemStock::query()->whereIn('stock_location_id', $ids)->whereIn('item_variant_id', $variantIds)->get(['item_variant_id', 'stock_location_id', 'quantity'])->groupBy('stock_location_id');
        $open = Stocktake::query()->whereIn('stock_location_id', $ids)->whereIn('status', [Stocktake::COUNTING, Stocktake::SUBMITTED])
            ->with(['lines' => fn ($q) => $q->whereIn('item_variant_id', $variantIds), 'starter:id,first_name,last_name', 'submitter:id,first_name,last_name'])->get()->keyBy('stock_location_id');

        return array_map(function (StockLocation $place) use ($item, $user, $people, $bands, $stock, $open): array {
            $band = $bands->get($place->id);
            $held = ($stock[$place->id] ?? collect())->keyBy('item_variant_id');
            $take = $open->get($place->id);
            $countedHere = $take?->lines->whereNotNull('counted')->keyBy('item_variant_id') ?? collect();
            $others = $take !== null && $take->lines()->whereNotNull('counted')->whereNotIn('item_variant_id', $item->variants->pluck('id'))->exists();

            return [
                'location_id' => (int) $place->id,
                'name' => (string) $place->name,
                'kind' => (string) $place->kind,
                'can_edit' => $this->canEdit($user, $place),
                'managers' => collect($people)->where('role', 'Manager')->pluck('name')->unique()->values()->all(),
                'pieces' => (int) $held->sum(fn ($r): int => (int) $r->quantity * $this->ladder->piecesPerUnit((int) $r->item_variant_id)),
                'band' => $band === null ? null : ['max' => (int) $band->max_units, 'refill' => (int) $band->refill_units, 'critical' => (int) $band->critical_units],
                'count' => [
                    'lines' => $item->variants->map(fn ($v): array => [
                        'variant_id' => (int) $v->id,
                        'label' => collect([$v->itemColor?->name, $v->itemSize?->name, $v->itemPackagingType?->name])->filter()->implode(' / ') ?: (string) $v->sku,
                        'expected' => (int) ($held->get($v->id)?->quantity ?? 0),
                        'counted' => $countedHere->has($v->id) ? (int) $countedHere->get($v->id)->counted : null,
                    ])->values()->all(),
                    'open' => $take === null ? null : [
                        'id' => (int) $take->id,
                        'reference' => (string) $take->reference,
                        'status' => (string) $take->status,
                        'started_by' => trim(($take->starter?->first_name ?? '').' '.($take->starter?->last_name ?? '')),
                        'submitted_by' => $take->submitter ? trim($take->submitter->first_name.' '.$take->submitter->last_name) : null,
                        'by_me' => $user !== null && (int) $take->submitted_by === (int) $user->id,
                        'has_this_item' => $countedHere->isNotEmpty(),
                        // A count with other items in it is approved where all of it can be seen (Admin → Counts).
                        'only_this_item' => ! $others,
                    ],
                ],
            ];
        }, $places);
    }
}
