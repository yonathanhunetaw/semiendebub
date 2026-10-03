<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCapacity;
use App\Services\Fulfillment\MovementDomainService;
use Illuminate\Support\Collection;

/**
 * Reading and writing the min/max band a variant has at a place.
 *
 * Two things live here and nowhere else:
 *
 *   1. What "on hand at this location" means per node kind. A shelf and a
 *      warehouse are stored figures; a back room is derived as the store's
 *      total minus its shelf, the same rule StoreLocationStockService
 *      documents, so shelf + back room always re-adds to the figure every other
 *      reader means by "the store's stock".
 *
 *   2. Which bands are currently breached. The planner asks that question; it
 *      does not compute it itself, so the observer, the scheduled sweep and the
 *      admin screens cannot disagree about what "below minimum" means.
 */
class LocationCapacityService
{
    public function __construct(
        private readonly MovementDomainService $domain,
        private readonly StockScope $scope,
    ) {
    }

    /*
    |--------------------------------------------------------------------------
    | On hand
    |--------------------------------------------------------------------------
    */

    /**
     * Units of a variant currently at one location.
     *
     * Counts packaging units, matching `item_stocks.quantity` — capacity bands
     * are expressed in the same unit, so the two are comparable without the
     * pieces-per-unit multiplication the storefront figures need.
     */
    public function onHand(int $itemVariantId, string $locationType, int $locationId): int
    {
        // Shelf and floor are separate leaves now (STOCK_PLAN.md phase 4), so
        // a back room is read, not derived from the store total minus the shelf.
        return $this->storedQuantity($itemVariantId, $locationType, $locationId);
    }

    /**
     * On-hand figures for many (variant, location) pairs at once.
     *
     * @param  array<int, array{item_variant_id: int, location_type: string, location_id: int}>  $pairs
     * @return array<string, int>  keyed "variantId|type|id"
     */
    public function onHandBatch(array $pairs): array
    {
        $figures = [];

        foreach ($pairs as $pair) {
            $key = $pair['item_variant_id'] . '|' . $pair['location_type'] . '|' . $pair['location_id'];

            $figures[$key] = $this->onHand(
                (int) $pair['item_variant_id'],
                (string) $pair['location_type'],
                (int) $pair['location_id'],
            );
        }

        return $figures;
    }

    /*
    |--------------------------------------------------------------------------
    | Bands
    |--------------------------------------------------------------------------
    */

    /**
     * Set (or clear) the band for one variant at one location.
     *
     * A zero floor and zero ceiling removes the row: capacity is opt-in, and an
     * all-zero band would otherwise read as "every location is below minimum",
     * which is how an auto-replenishment planner floods a store with proposals.
     */
    public function setBand(
        StoreVariant $storeVariant,
        string $locationType,
        int $locationId,
        int $minCapacity,
        int $maxCapacity,
        ?int $setBy = null,
    ): ?StoreVariantCapacity {
        $minCapacity = max(0, $minCapacity);
        $maxCapacity = max(0, $maxCapacity);

        if ($minCapacity === 0 && $maxCapacity === 0) {
            StoreVariantCapacity::query()
                ->where('store_variant_id', $storeVariant->id)
                ->atLocation($locationType, $locationId)
                ->delete();

            return null;
        }

        return StoreVariantCapacity::query()->updateOrCreate(
            [
                'store_variant_id' => $storeVariant->id,
                'location_type' => $locationType,
                'location_id' => $locationId,
            ],
            [
                'item_variant_id' => $storeVariant->item_variant_id,
                'min_capacity' => $minCapacity,
                // A ceiling below the floor can never be satisfied; treat the
                // floor as the minimum sensible ceiling rather than refusing.
                'max_capacity' => max($minCapacity, $maxCapacity),
                'set_by' => $setBy,
            ],
        );
    }

    /**
     * Every level this variant's store can hold stock at, with the band set
     * there (if any) and the figure on hand — the shape the capacity UI needs.
     *
     * @return array<int, array<string, mixed>>
     */
    public function bandsFor(StoreVariant $storeVariant): array
    {
        $store = $storeVariant->store;

        if ($store === null) {
            return [];
        }

        $bands = StoreVariantCapacity::query()
            ->where('store_variant_id', $storeVariant->id)
            ->get()
            ->keyBy(fn (StoreVariantCapacity $band): string => $band->location_type . '#' . $band->location_id);

        $rows = [];

        foreach ($this->domain->hierarchyFor($store) as $node) {
            $band = $bands->get($node['type'] . '#' . $node['id']);
            $onHand = $this->onHand((int) $storeVariant->item_variant_id, $node['type'], (int) $node['id']);

            $rows[] = [
                'location_type' => $node['type'],
                'location_id' => $node['id'],
                'kind' => $node['kind'],
                'level_label' => $node['label'],
                'name' => $node['name'],
                'is_structural' => $this->domain->isStructural($node['kind']),
                'min_capacity' => (int) ($band->min_capacity ?? 0),
                'max_capacity' => (int) ($band->max_capacity ?? 0),
                'on_hand' => $onHand,
                'monitored' => $band !== null && $band->min_capacity > 0,
                'breached' => $band !== null && $band->isBreachedBy($onHand),
                'shortfall' => $band !== null ? $band->shortfallFrom($onHand) : 0,
            ];
        }

        return $rows;
    }

    /*
    |--------------------------------------------------------------------------
    | Breaches
    |--------------------------------------------------------------------------
    */

    /**
     * Monitored bands whose location has fallen to or below its floor.
     *
     * Only bands with a floor above zero are considered — see setBand().
     *
     * @param  array<int, int>  $storeVariantIds  narrow the sweep; empty means all
     * @return Collection<int, array{capacity: StoreVariantCapacity, on_hand: int, shortfall: int}>
     */
    public function breaches(array $storeVariantIds = []): Collection
    {
        $query = StoreVariantCapacity::query()
            ->monitored()
            ->with(['storeVariant.store', 'storeVariant.itemVariant.item']);

        if ($storeVariantIds !== []) {
            $query->whereIn('store_variant_id', $storeVariantIds);
        }

        return $query->get()
            ->map(function (StoreVariantCapacity $capacity): ?array {
                // A band whose variant row has gone is not actionable.
                if ($capacity->storeVariant === null) {
                    return null;
                }

                $onHand = $this->onHand(
                    (int) $capacity->item_variant_id,
                    (string) $capacity->location_type,
                    (int) $capacity->location_id,
                );

                if (! $capacity->isBreachedBy($onHand)) {
                    return null;
                }

                return [
                    'capacity' => $capacity,
                    'on_hand' => $onHand,
                    'shortfall' => $capacity->shortfallFrom($onHand),
                ];
            })
            ->filter()
            ->values();
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    /** What the leaves behind an address hold. See StockScope. */
    private function storedQuantity(int $itemVariantId, string $locationType, int $locationId): int
    {
        return (int) ItemStock::query()
            ->where('item_variant_id', $itemVariantId)
            ->whereIn('stock_location_id', $this->scope->leafIds($locationType, $locationId))
            ->sum('quantity');
    }

    /**
     * Every stock-bearing location in the system, shaped for a picker.
     *
     * @return array<int, array<string, mixed>>
     */
    public function selectableLocations(?Store $store = null): array
    {
        $nodes = [];

        if ($store !== null) {
            $nodes = $this->domain->hierarchyFor($store);
        } else {
            foreach (Store::query()->orderBy('name')->get() as $facility) {
                foreach ($this->domain->hierarchyFor($facility) as $node) {
                    $nodes[$node['type'] . '#' . $node['id']] = $node;
                }
            }

            foreach (Warehouse::query()->orderBy('name')->get() as $warehouse) {
                $node = $this->domain->describe(Warehouse::class, (int) $warehouse->id);
                $nodes[$node['type'] . '#' . $node['id']] = $node;
            }

            $nodes = array_values($nodes);
        }

        return array_map(fn (array $node): array => [
            'location_type' => $node['type'],
            'location_id' => $node['id'],
            'kind' => $node['kind'],
            'level_label' => $node['label'],
            'name' => $node['name'],
            'store_id' => $node['store_id'],
        ], $nodes);
    }

    /** Who set a band last, for the audit line the capacity screen shows. */
    public function setterName(?User $user): ?string
    {
        if ($user === null) {
            return null;
        }

        return trim($user->first_name . ' ' . $user->last_name) ?: $user->email;
    }
}
