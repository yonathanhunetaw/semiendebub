<?php

declare(strict_types=1);

namespace App\Services\Fulfillment;

use App\Exceptions\MovementDomainException;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Store\Store;

/**
 * The one authority on what kind of movement a leg is.
 *
 * The system has three movement types and they had drifted into synonyms —
 * `transfers` rows describing warehouse-to-warehouse freight, `shipments`
 * rows describing a top-up into a shop floor, and a Delivery that could not say
 * where it left from. The definitions, now enforced rather than implied:
 *
 *   Shipment  bulk freight between major structural nodes.
 *             Warehouse A → Warehouse B, Warehouse → Remote Warehouse.
 *             BOTH ends must be warehouse-class.
 *
 *   Transfer  internal or localized inventory balancing.
 *             Remote Warehouse → Store Back Room, Back Room → Shop Floor,
 *             Main Warehouse → Store. AT LEAST ONE end must be store-level.
 *
 *   Delivery  fulfilment of an external customer order. It originates from the
 *             specific location confirmed during Pick & Pack, and ends at a
 *             customer rather than at a node of the network.
 *
 * Nodes are addressed with the same (type, id) pair `item_stocks`,
 * `store_variant_capacities` and the new transfer endpoints use, so a caller
 * never has to translate vocabularies to ask a question here.
 */
class MovementDomainService
{
    /**
     * Resolved nodes, keyed "type#id".
     *
     * describe() has to load the model to answer — a `stores` row's kind comes
     * from its own `type` column — and the planner asks about the same handful
     * of locations once per variant. Memoising per request keeps a sweep over a
     * few hundred capacity rows at a few queries rather than a few hundred.
     *
     * @var array<string, array<string, mixed>>
     */
    private array $resolved = [];

    /*
    |--------------------------------------------------------------------------
    | Node kinds, nearest to furthest
    |--------------------------------------------------------------------------
    */

    public const NODE_SHELF = 'shelf';

    public const NODE_BACKROOM = 'backroom';

    /** A facility taken as a whole, i.e. a retail store's own total. */
    public const NODE_STORE = 'store';

    public const NODE_REMOTE_WAREHOUSE = 'remote_warehouse';

    public const NODE_MAIN_WAREHOUSE = 'main_warehouse';

    /** A stock-bearing place that is none of the above. */
    public const NODE_OTHER = 'other';

    /** Goods in a courier's hands ("In Delivery"). Never an endpoint. */
    public const NODE_TRANSIT = 'transit';

    public const DOMAIN_SHIPMENT = 'shipment';

    public const DOMAIN_TRANSFER = 'transfer';

    public const DOMAIN_DELIVERY = 'delivery';

    /**
     * Freight nodes. Movement *between two of these* is a Shipment.
     *
     * @var array<int, string>
     */
    public const STRUCTURAL_NODES = [self::NODE_MAIN_WAREHOUSE, self::NODE_REMOTE_WAREHOUSE];

    /**
     * Store-level places. A leg touching one of these is a Transfer.
     *
     * @var array<int, string>
     */
    public const LOCALIZED_NODES = [self::NODE_SHELF, self::NODE_BACKROOM, self::NODE_STORE, self::NODE_OTHER];

    /**
     * How close each kind is to the customer. Lower is closer, and the order is
     * what "closest available location" means at checkout and what the
     * replenishment planner walks up when it looks for a source.
     *
     * @var array<string, int>
     */
    public const PROXIMITY = [
        self::NODE_SHELF => 0,
        self::NODE_BACKROOM => 1,
        self::NODE_STORE => 2,
        self::NODE_REMOTE_WAREHOUSE => 3,
        self::NODE_MAIN_WAREHOUSE => 4,
        self::NODE_OTHER => 5,
        self::NODE_TRANSIT => 6,
    ];

    /** Human labels, for UI and for exception messages. */
    public const LABELS = [
        self::NODE_SHELF => 'Store Shelf',
        self::NODE_BACKROOM => 'Store Floor',
        self::NODE_STORE => 'Store',
        self::NODE_REMOTE_WAREHOUSE => 'Remote Hub',
        self::NODE_MAIN_WAREHOUSE => 'Main Hub',
        self::NODE_OTHER => 'Other Location',
        self::NODE_TRANSIT => 'In Delivery',
    ];

    /*
    |--------------------------------------------------------------------------
    | Classification
    |--------------------------------------------------------------------------
    */

    /**
     * What kind of node is this (location_type, location_id)?
     *
     * Resolves the model because the answer depends on its own data: a `stores`
     * row is a shop, a remote warehouse or a main warehouse according to
     * `stores.type`, and an `item_inventory_locations` row is a shelf or a back
     * room according to `kind`.
     */
    public function nodeKindFor(string $locationType, int $locationId): string
    {
        return $this->describe($locationType, $locationId)['kind'];
    }

    /**
     * A node, resolved once and ready for both rules and screens.
     *
     * @return array{type: string, id: int, kind: string, label: string, name: string, store_id: int|null, proximity: int}
     */
    public function describe(string $locationType, int $locationId): array
    {
        $cacheKey = $locationType . '#' . $locationId;

        if (isset($this->resolved[$cacheKey])) {
            /** @var array{type: string, id: int, kind: string, label: string, name: string, store_id: int|null, proximity: int} */
            return $this->resolved[$cacheKey];
        }

        $kind = self::NODE_OTHER;
        $name = 'Unknown location';
        $storeId = null;

        if ($locationType === Store::class) {
            $store = Store::find($locationId);
            $name = $store?->name ?? $name;
            $storeId = $store?->id;

            $kind = match (true) {
                $store === null => self::NODE_OTHER,
                $store->isMainWarehouse() => self::NODE_MAIN_WAREHOUSE,
                $store->isRemoteWarehouse() => self::NODE_REMOTE_WAREHOUSE,
                default => self::NODE_STORE,
            };
        } elseif ($locationType === Warehouse::class) {
            $warehouse = Warehouse::find($locationId);
            $name = $warehouse?->name ?? $name;
            // `warehouses` rows are the shared Main Distribution Hubs A and B
            // (STOCK_PLAN.md §1). They used to read as a store's remote
            // warehouse through warehouses.store_id; no store owns them.
            $storeId = null;
            $kind = self::NODE_MAIN_WAREHOUSE;
        } elseif ($locationType === StockLocation::class) {
            $location = StockLocation::find($locationId);
            $name = $location?->name ?? $name;
            $storeId = $location?->store_id;

            $kind = match ($location?->kind) {
                StockLocation::KIND_SHELF => self::NODE_SHELF,
                StockLocation::KIND_BACKROOM => self::NODE_BACKROOM,
                StockLocation::KIND_STORE => self::NODE_STORE,
                StockLocation::KIND_REMOTE_HUB => self::NODE_REMOTE_WAREHOUSE,
                StockLocation::KIND_MAIN_HUB => self::NODE_MAIN_WAREHOUSE,
                StockLocation::KIND_TRANSIT => self::NODE_TRANSIT,
                default => self::NODE_OTHER,
            };
        } elseif ($locationType === ItemInventoryLocation::class) {
            $location = ItemInventoryLocation::find($locationId);
            $name = $location?->name ?? $name;
            $storeId = $location?->store_id;

            $kind = match ($location?->kind) {
                ItemInventoryLocation::KIND_SHELF => self::NODE_SHELF,
                ItemInventoryLocation::KIND_BACKROOM => self::NODE_BACKROOM,
                default => self::NODE_OTHER,
            };
        }

        return $this->resolved[$cacheKey] = [
            'type' => $locationType,
            'id' => $locationId,
            'kind' => $kind,
            'label' => self::LABELS[$kind] ?? 'Location',
            'name' => $name,
            'store_id' => $storeId !== null ? (int) $storeId : null,
            'proximity' => self::PROXIMITY[$kind] ?? 9,
        ];
    }

    public function isStructural(string $kind): bool
    {
        return in_array($kind, self::STRUCTURAL_NODES, true);
    }

    public function isLocalized(string $kind): bool
    {
        return in_array($kind, self::LOCALIZED_NODES, true);
    }

    /*
    |--------------------------------------------------------------------------
    | The rule
    |--------------------------------------------------------------------------
    */

    /**
     * Which domain a leg between two nodes belongs to.
     *
     * Customer-bound movement never reaches here: a Delivery is defined by its
     * destination being a customer, not a node, so callers state that
     * explicitly via assertDeliveryOrigin().
     */
    public function domainForKinds(string $fromKind, string $toKind): string
    {
        // Freight leaves a Main Hub (A or B) for a store or a Remote Hub; a
        // courier carries it (STOCK_PLAN.md phase 4, as the business runs it).
        // Every other leg — Remote Hub ↔ store, floor ↔ shelf, a return to a
        // hub — is a Transfer.
        return $fromKind === self::NODE_MAIN_WAREHOUSE
            ? self::DOMAIN_SHIPMENT
            : self::DOMAIN_TRANSFER;
    }

    /** Where a shipment may deliver to: a store (its floor) or a Remote Hub. */
    public const SHIPMENT_DESTINATIONS = [self::NODE_STORE, self::NODE_BACKROOM, self::NODE_REMOTE_WAREHOUSE];

    /**
     * A shipment runs from a Main Hub to a store and/or a Remote Hub.
     *
     * @param  array{kind: string, label: string, id: int, type: string}  $from
     * @param  array{kind: string, label: string, id: int, type: string}  $to
     *
     * @throws MovementDomainException
     */
    public function assertShipmentEnds(array $from, array $to): void
    {
        if ($from['type'] === $to['type'] && $from['id'] === $to['id']) {
            throw new MovementDomainException('A shipment must move between two different places.', self::DOMAIN_SHIPMENT);
        }

        if ($from['kind'] !== self::NODE_MAIN_WAREHOUSE) {
            throw new MovementDomainException(
                "Shipments leave a Main Hub (A or B). {$from['label']} sends stock as a transfer instead.",
                self::DOMAIN_SHIPMENT,
            );
        }

        if (! in_array($to['kind'], self::SHIPMENT_DESTINATIONS, true)) {
            throw new MovementDomainException(
                "A shipment goes to a store or a Remote Hub, not to a {$to['label']}.",
                self::DOMAIN_SHIPMENT,
            );
        }
    }

    /**
     * @param  array{kind: string, label: string}  $from
     * @param  array{kind: string, label: string}  $to
     */
    public function domainFor(array $from, array $to): string
    {
        return $this->domainForKinds($from['kind'], $to['kind']);
    }

    /**
     * A Shipment carries freight between two structural nodes.
     *
     * @throws MovementDomainException when either end is store-level
     */
    public function assertShipmentLeg(Store $origin, Store $destination): void
    {
        $this->assertShipmentEnds(
            $this->describe(Store::class, (int) $origin->id),
            $this->describe(Store::class, (int) $destination->id),
        );
    }

    /**
     * A Transfer balances stock where at least one end is store-level.
     *
     * @throws MovementDomainException when both ends are warehouses
     */
    public function assertTransferLeg(string $fromType, int $fromId, string $toType, int $toId): void
    {
        $from = $this->describe($fromType, $fromId);
        $to = $this->describe($toType, $toId);

        if ($fromType === $toType && $fromId === $toId) {
            throw new MovementDomainException(
                'A transfer must move between two different locations.',
                self::DOMAIN_TRANSFER,
            );
        }

        if ($from['kind'] === self::NODE_TRANSIT || $to['kind'] === self::NODE_TRANSIT) {
            throw new MovementDomainException(
                'In Delivery is where goods are while a courier carries them, not a place to send them.',
                self::DOMAIN_TRANSFER,
            );
        }

        if ($this->domainFor($from, $to) !== self::DOMAIN_TRANSFER) {
            throw MovementDomainException::wrongDomain(
                self::DOMAIN_TRANSFER,
                self::DOMAIN_SHIPMENT,
                $from,
                $to,
            );
        }
    }

    /**
     * A Delivery leaves one named location. "The store" is not a location when
     * the store holds stock in three places — that is the gap Pick & Pack
     * closes, so an unsourced delivery is refused here rather than guessed at.
     *
     * @throws MovementDomainException when no source location was confirmed
     */
    public function assertDeliveryOrigin(?string $locationType, ?int $locationId): void
    {
        if ($locationType === null || $locationId === null) {
            throw new MovementDomainException(
                'A delivery must originate from the location confirmed during Pick & Pack.',
                self::DOMAIN_DELIVERY,
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | The hierarchy, as a list
    |--------------------------------------------------------------------------
    */

    /**
     * Every place a store can draw stock from, nearest first.
     *
     * One list, used by three callers that previously each had their own idea
     * of the hierarchy: checkout grouping, Pick & Pack's location picker, and
     * the replenishment planner's search for a source.
     *
     * @return array<int, array{type: string, id: int, kind: string, label: string, name: string, store_id: int|null, proximity: int}>
     */
    public function hierarchyFor(Store $store): array
    {
        $nodes = [];

        $store->loadMissing(['inventoryLocations']);

        foreach ($store->inventoryLocations as $location) {
            if ($location->kind === ItemInventoryLocation::KIND_OTHER) {
                continue;
            }

            $nodes[] = $this->describe(ItemInventoryLocation::class, (int) $location->id);
        }

        // The store's own total. Shelf and back room are subsets of it, so it
        // sits behind them: a line is "in store" before it is "on the floor".
        $nodes[] = $this->describe(Store::class, (int) $store->id);

        // The store's own Remote Hub, then every shared main hub, from the one
        // location tree. Each is addressed by its legacy twin where it has one,
        // so capacity bands keyed the old way still match.
        $remoteHubs = StockLocation::query()
            ->where('store_id', $store->id)
            ->ofKind(StockLocation::KIND_REMOTE_HUB)
            ->get();

        $mainHubs = StockLocation::query()
            ->ofKind(StockLocation::KIND_MAIN_HUB)
            ->orderBy('name')
            ->get();

        foreach ($remoteHubs->concat($mainHubs) as $hub) {
            $nodes[] = $hub->legacy_type !== null && $hub->legacy_id !== null
                ? $this->describe((string) $hub->legacy_type, (int) $hub->legacy_id)
                : $this->describe(StockLocation::class, (int) $hub->id);
        }

        usort($nodes, fn (array $a, array $b): int => $a['proximity'] <=> $b['proximity']);

        return $nodes;
    }

    /**
     * Facilities acting as hubs: `stores` rows typed central_warehouse, plus
     * remote-warehouse facilities, which are structural too.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, Store>
     */
    public function mainWarehouses(): \Illuminate\Database\Eloquent\Collection
    {
        return Store::query()
            ->whereIn('type', [Store::TYPE_CENTRAL_WAREHOUSE, Store::TYPE_REMOTE_WAREHOUSE])
            ->orderBy('name')
            ->get();
    }

    /**
     * How long a line sourced from this kind of node takes to reach the buyer.
     *
     * Only main-warehouse sourcing introduces a wait the buyer has to agree to
     * before paying; everything closer is same-day.
     *
     * @return array{delayed: bool, promise: string}
     */
    public function fulfilmentPromiseFor(string $kind): array
    {
        return $kind === self::NODE_MAIN_WAREHOUSE
            ? ['delayed' => true, 'promise' => (string) config('inventory.delayed_promise', 'Available tomorrow')]
            : ['delayed' => false, 'promise' => (string) config('inventory.same_day_promise', 'Available today')];
    }
}
