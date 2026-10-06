<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Store\Store;

/**
 * Keeps the stock_locations tree in step with the legacy facility tables.
 *
 * Until phase 5 retires `warehouses` and `item_inventory_locations`, a store or
 * warehouse can still be created or renamed through the old screens. Store and
 * Warehouse call in here from their model events so the tree never falls
 * behind. Every method is idempotent: a node is found by the legacy row it was
 * built from, and only its descriptive fields are refreshed.
 *
 * The one-off backfill of rows that already existed is
 * database/migrations/2026_10_03_100100_backfill_stock_locations.php, which
 * builds the same shapes with the same codes.
 */
class StockLocationTree
{
    /** @var array<string, int> legacy "Type#id" => stockable leaf id */
    private array $leafIds = [];

    /**
     * A retail store's group node plus its Store Shelf and Store (floor).
     *
     * A warehouse-type `stores` row (central_warehouse / remote_warehouse) is a
     * single stockable hub instead, with no children.
     */
    public function syncStore(Store $store): StockLocation
    {
        if ($store->type === Store::TYPE_CENTRAL_WAREHOUSE || $store->type === Store::TYPE_REMOTE_WAREHOUSE) {
            return $this->upsert(Store::class, (int) $store->id, [
                'kind' => $store->type === Store::TYPE_CENTRAL_WAREHOUSE
                    ? StockLocation::KIND_MAIN_HUB
                    : StockLocation::KIND_REMOTE_HUB,
                'name' => $store->name,
                'address' => $store->location,
                'status' => $store->status ?: 'active',
                'store_id' => null,
                'parent_id' => null,
                'is_stockable' => true,
            ], $store->code ?: 'HUB-S'.$store->id);
        }

        $node = $this->upsert(Store::class, (int) $store->id, [
            'kind' => StockLocation::KIND_STORE,
            'name' => $store->name,
            'address' => $store->location,
            'status' => $store->status ?: 'active',
            'store_id' => $store->id,
            'parent_id' => null,
            'is_stockable' => false,
        ], 'STORE-'.$store->id);

        // Every retail store has a shelf and a floor. Store::booted() makes
        // the legacy rows, but not when model events are off (seeding).
        foreach ([[ItemInventoryLocation::KIND_SHELF, 'Shop Floor'], [ItemInventoryLocation::KIND_BACKROOM, 'Back Room']] as [$kind, $name]) {
            ItemInventoryLocation::query()->firstOrCreate(
                ['store_id' => $store->id, 'kind' => $kind],
                ['name' => $name, 'address' => ''],
            );
        }

        $areas = ItemInventoryLocation::query()
            ->where('store_id', $store->id)
            ->whereIn('kind', [ItemInventoryLocation::KIND_SHELF, ItemInventoryLocation::KIND_BACKROOM])
            ->get();

        foreach ($areas as $area) {
            $this->syncArea($area, $node);
        }

        return $node;
    }

    /** A store's shelf or floor, hung under the store's group node. */
    public function syncArea(ItemInventoryLocation $area, ?StockLocation $storeNode = null): ?StockLocation
    {
        $kind = match ($area->kind) {
            ItemInventoryLocation::KIND_SHELF => StockLocation::KIND_SHELF,
            ItemInventoryLocation::KIND_BACKROOM => StockLocation::KIND_BACKROOM,
            default => null,
        };

        if ($kind === null || $area->store_id === null) {
            return null;
        }

        $storeNode ??= StockLocation::query()->legacy(Store::class, (int) $area->store_id)->first();

        if ($storeNode === null) {
            return null;
        }

        return $this->upsert(ItemInventoryLocation::class, (int) $area->id, [
            'kind' => $kind,
            'name' => StockLocation::kindLabels()[$kind],
            'address' => $area->address ?: null,
            'status' => 'active',
            'store_id' => $area->store_id,
            'parent_id' => $storeNode->id,
            'is_stockable' => true,
        ], 'STORE-'.$area->store_id.($kind === StockLocation::KIND_SHELF ? '-SHELF' : '-FLOOR'));
    }

    /** An off-site `warehouses` row is a shared main hub. */
    public function syncWarehouse(Warehouse $warehouse): StockLocation
    {
        return $this->upsert(Warehouse::class, (int) $warehouse->id, [
            'kind' => StockLocation::KIND_MAIN_HUB,
            'name' => $warehouse->name,
            'address' => $warehouse->address,
            'status' => $warehouse->status ?: 'active',
            'store_id' => null,
            'parent_id' => null,
            'is_stockable' => true,
        ], $warehouse->code ?: 'HUB-W'.$warehouse->id);
    }

    /**
     * Bring the whole tree up to date with every store, store area and
     * warehouse. Idempotent. Seeding runs with model events off
     * (DatabaseSeeder uses WithoutModelEvents), so nothing above fires there;
     * StockLocationSeeder calls this before any stock is booked.
     *
     * @return int nodes in the tree afterwards
     */
    public function syncAll(): int
    {
        foreach (Store::query()->orderBy('id')->get() as $store) {
            $this->syncStore($store);
        }

        foreach (Warehouse::query()->orderBy('id')->get() as $warehouse) {
            $this->syncWarehouse($warehouse);
        }

        $this->leafIds = [];

        return StockLocation::query()->count();
    }

    /**
     * The stockable leaf a legacy item_stocks address books into.
     *
     *   Store (retail)            → that store's floor ("Store")
     *   Store (warehouse type)    → its hub
     *   Warehouse                 → its main hub
     *   ItemInventoryLocation     → its shelf / floor leaf
     *
     * A retail Store row maps to the floor, not the group node: the group node
     * is never stockable. Until the phase-4 cutover a Store row still carries
     * the store's whole total; shelf stock is subtracted from it then.
     */
    public function leafIdFor(string $legacyType, int $legacyId): ?int
    {
        // Rows the gateway creates at a location with no legacy twin (a
        // Remote Hub) are addressed at the location itself.
        if ($legacyType === StockLocation::class) {
            return StockLocation::query()->whereKey($legacyId)->where('is_stockable', true)->exists() ? $legacyId : null;
        }

        $key = $legacyType.'#'.$legacyId;

        if (isset($this->leafIds[$key])) {
            return $this->leafIds[$key];
        }

        $node = StockLocation::query()->legacy($legacyType, $legacyId)->first(['id', 'kind', 'is_stockable']);

        if ($node !== null && $node->kind === StockLocation::KIND_STORE) {
            $node = StockLocation::query()
                ->where('parent_id', $node->id)
                ->where('kind', StockLocation::KIND_BACKROOM)
                ->first(['id', 'kind', 'is_stockable']);
        }

        if ($node === null || ! $node->is_stockable) {
            return null;
        }

        // Only hits are cached; a miss may be a node created a moment later.
        return $this->leafIds[$key] = (int) $node->id;
    }

    /**
     * The (location_type, location_id) pair a new item_stocks row at this leaf
     * is written with, so readers still on the morph columns see it where they
     * already look. Goes with the morph columns in phase 5.
     *
     *   floor              → Store (existing floor rows are store-level rows)
     *   shelf              → its ItemInventoryLocation
     *   hub from warehouse → its Warehouse
     *   anything else      → the StockLocation itself
     *
     * @return array{0: string, 1: int}
     */
    public function legacyAddressFor(StockLocation $leaf): array
    {
        if ($leaf->kind === StockLocation::KIND_BACKROOM && $leaf->store_id !== null) {
            return [Store::class, (int) $leaf->store_id];
        }

        if ($leaf->legacy_type !== null && $leaf->legacy_id !== null) {
            return [(string) $leaf->legacy_type, (int) $leaf->legacy_id];
        }

        return [StockLocation::class, (int) $leaf->id];
    }

    /**
     * The custody location: goods a courier is carrying between two places,
     * or out to a customer. Created on first use.
     */
    public function transit(): StockLocation
    {
        return StockLocation::query()->firstOrCreate(
            ['code' => StockLocation::TRANSIT_CODE],
            [
                'kind' => StockLocation::KIND_TRANSIT,
                'name' => 'In Delivery',
                'status' => 'active',
                'is_stockable' => true,
                'parent_id' => null,
                'store_id' => null,
            ],
        );
    }

    /**
     * Give a retail store its Remote Hub — never done automatically, and at
     * most one per store, so asking twice returns the existing one.
     */
    public function addRemoteHub(Store $store, ?string $name = null): StockLocation
    {
        $node = $this->syncStore($store);

        $existing = StockLocation::query()
            ->where('store_id', $store->id)
            ->where('kind', StockLocation::KIND_REMOTE_HUB)
            ->first();

        if ($existing !== null) {
            return $existing;
        }

        return StockLocation::query()->create([
            'parent_id' => $node->id,
            'kind' => StockLocation::KIND_REMOTE_HUB,
            'name' => $name ?? 'Remote Hub',
            'code' => $this->freeCode('STORE-'.$store->id.'-REMOTE'),
            'status' => 'active',
            'store_id' => $store->id,
            'is_stockable' => true,
        ]);
    }

    /** Drop the node built from a legacy row; its children go with it (FK cascade). */
    public function forget(string $legacyType, int $legacyId): void
    {
        StockLocation::query()->legacy($legacyType, $legacyId)->delete();
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function upsert(string $legacyType, int $legacyId, array $attributes, string $code): StockLocation
    {
        $location = StockLocation::query()->legacy($legacyType, $legacyId)->first()
            ?? new StockLocation(['legacy_type' => $legacyType, 'legacy_id' => $legacyId]);

        if (! $location->exists) {
            $location->code = $this->freeCode($code);
        }

        $location->fill($attributes)->save();

        return $location;
    }

    /** Codes are unique across the whole tree; suffix on the rare collision. */
    private function freeCode(string $code): string
    {
        $candidate = $code;

        for ($n = 2; StockLocation::query()->where('code', $candidate)->exists(); $n++) {
            $candidate = $code.'-'.$n;
        }

        return $candidate;
    }
}
