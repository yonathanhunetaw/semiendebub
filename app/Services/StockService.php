<?php

namespace App\Services;

use App\Exceptions\InsufficientStockException;
use App\Models\Auth\Customer;
use App\Models\Inventory\InventoryMovement;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\StockReservation;
use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\StockLocationTree;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class StockService
{
    /**
     * Calculate current dynamic stock for a store variant by summing all ledger movements.
     * The inventory_movements table is the Single Source of Truth (SSOT).
     */
    public function getCurrentStock(int|StoreVariant $storeVariant): int
    {
        $storeVariantId = $storeVariant instanceof StoreVariant ? $storeVariant->id : $storeVariant;

        return $this->getBatchStock([$storeVariantId])[$storeVariantId] ?? 0;
    }

    /**
     * Check if a store variant has sufficient available stock for a requested quantity.
     */
    public function hasSufficientStock(int|StoreVariant $storeVariant, int $requestedQuantity): bool
    {
        if ($requestedQuantity <= 0) {
            return true;
        }

        $currentStock = $this->getCurrentStock($storeVariant);

        return $currentStock >= $requestedQuantity;
    }

    /**
     * Batch fetch current stock balances for multiple store variant IDs in a single aggregated query.
     * Avoids N+1 query overhead across catalog and dashboard listings.
     *
     * @param array<int> $storeVariantIds
     * @return array<int, int> [store_variant_id => current_stock]
     */
    public function getBatchStock(array $storeVariantIds): array
    {
        if (empty($storeVariantIds)) {
            return [];
        }

        /*
         * item_stocks is the ledger of record.
         *
         * Stock is booked against an item_variant at a location — before a
         * StoreVariant exists, and whether or not one ever does. That decision
         * is what this method now reflects: the positional ledger answers
         * first, and `inventory_movements` is consulted only for a store
         * variant that has no positional row at all.
         *
         * It used to be the other way round, which meant a variant with a
         * single stale movement row reported that figure for ever while
         * item_stocks — the table every other service, screen and seeder
         * writes — was ignored. Movements remain the audit journal (who moved
         * what, why, when) and are never the authority on how much is on hand.
         *
         * Figures are in the variant's own packaging unit, matching
         * item_stocks.quantity and the quantities carts and sales carry. For
         * cross-variant totals, which must be converted to pieces first, use
         * App\Services\Inventory\ItemStockReader.
         */
        // A store's stock is its shelf + floor (STOCK_PLAN.md phase 4); its
        // Remote Hub is a separate tier and is not on hand at the counter.
        $positionalTotals = DB::table('store_variants as sv')
            ->join('stock_locations as l', function ($join): void {
                $join->on('l.store_id', '=', 'sv.store_id')
                    ->whereIn('l.kind', [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM]);
            })
            ->join('item_stocks as s', function ($join): void {
                $join->on('s.item_variant_id', '=', 'sv.item_variant_id')
                    ->whereColumn('s.stock_location_id', 'l.id');
            })
            ->whereIn('sv.id', $storeVariantIds)
            ->groupBy('sv.id')
            ->selectRaw('sv.id as store_variant_id, SUM(s.quantity) as total_stock')
            ->pluck('total_stock', 'store_variant_id')
            ->all();

        $untracked = array_values(array_diff($storeVariantIds, array_keys($positionalTotals)));

        $movementTotals = $untracked === [] ? [] : InventoryMovement::whereIn('store_variant_id', $untracked)
            ->groupBy('store_variant_id')
            ->selectRaw('store_variant_id, SUM(quantity) as total_stock')
            ->pluck('total_stock', 'store_variant_id')
            ->all();

        $totals = $positionalTotals + $movementTotals;

        // Ensure all requested IDs exist in result with 0 default
        $result = [];
        foreach ($storeVariantIds as $id) {
            $result[$id] = (int) ($totals[$id] ?? 0);
        }

        return $result;
    }

    /**
     * Where a set of variants' stock physically sits, for one store's screens.
     *
     * Replaces the arithmetic the admin stock tool used to do in the browser —
     * a quarter of the store total called "shelf", three quarters called
     * "store room", and warehouse figures the server never sent at all, so
     * every warehouse pill read 0 while item_stocks held 1,443 units.
     *
     * The shape per variant id:
     *   store_total  units at this store: shelf + floor
     *   shelf        units on this store's Store Shelf
     *   backroom     units on this store's floor ("Store")
     *   warehouses   [warehouse_id => units]
     *   other_stores [store_id => units]
     *
     * @param  array<int>  $itemVariantIds
     * @return array<int, array<string, mixed>>
     */
    public function locationBreakdown(array $itemVariantIds, int $storeId): array
    {
        $itemVariantIds = array_values(array_unique(array_map('intval', $itemVariantIds)));

        if ($itemVariantIds === []) {
            return [];
        }

        $rows = DB::table('item_stocks as s')
            ->join('stock_locations as l', 'l.id', '=', 's.stock_location_id')
            ->whereIn('s.item_variant_id', $itemVariantIds)
            ->select('s.item_variant_id', 's.quantity', 'l.kind', 'l.store_id', 'l.legacy_type', 'l.legacy_id')
            ->get();

        $blank = [
            'store_total' => 0,
            'shelf' => 0,
            'backroom' => 0,
            'warehouses' => [],
            'other_stores' => [],
        ];

        $result = array_fill_keys($itemVariantIds, $blank);

        // Shelf and floor are disjoint leaves, so the store's total is their
        // sum and the floor ("backroom" key, kept for callers) is read, not
        // derived.
        foreach ($rows as $row) {
            $variantId = (int) $row->item_variant_id;
            $quantity = (int) $row->quantity;
            $rowStoreId = $row->store_id !== null ? (int) $row->store_id : null;

            if (in_array($row->kind, [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM], true)) {
                if ($rowStoreId === $storeId) {
                    $result[$variantId]['store_total'] += $quantity;
                    $result[$variantId][$row->kind === StockLocation::KIND_SHELF ? 'shelf' : 'backroom'] += $quantity;
                } elseif ($rowStoreId !== null) {
                    $result[$variantId]['other_stores'][$rowStoreId] =
                        ($result[$variantId]['other_stores'][$rowStoreId] ?? 0) + $quantity;
                }

                continue;
            }

            if ($row->kind === StockLocation::KIND_MAIN_HUB && $row->legacy_type === Warehouse::class) {
                $warehouseId = (int) $row->legacy_id;
                $result[$variantId]['warehouses'][$warehouseId] =
                    ($result[$variantId]['warehouses'][$warehouseId] ?? 0) + $quantity;
            }
        }

        return $result;
    }

    /**
     * Record an audit movement row directly into the SSOT ledger.
     */
    public function recordMovement(array $data): InventoryMovement
    {
        return InventoryMovement::create($data);
    }

    /**
     * Record inventory added from a purchase.
     */
    public function recordPurchase(
        StoreVariant $storeVariant,
        int $quantity,
        ?string $reference = null,
        ?int $userId = null,
        ?int $warehouseId = null
    ): InventoryMovement {
        if ($quantity <= 0) {
            throw new InvalidArgumentException("Purchase quantity must be greater than zero.");
        }

        return $this->recordMovement([
            'store_variant_id' => $storeVariant->id,
            'type' => 'purchase',
            'quantity' => abs($quantity), // positive
            'source_type' => $warehouseId ? Warehouse::class : 'supplier',
            'source_id' => $warehouseId,
            'destination_type' => Store::class,
            'destination_id' => $storeVariant->store_id,
            'reference_id' => $reference,
            'user_id' => $userId ?? auth()->id(),
        ]);
    }

    /**
     * Record inventory deducted from a sale.
     */
    public function recordSale(
        StoreVariant $storeVariant,
        int $quantity,
        ?string $reference = null,
        ?int $userId = null,
        ?int $customerId = null
    ): InventoryMovement {
        if ($quantity <= 0) {
            throw new InvalidArgumentException("Sale quantity must be greater than zero.");
        }

        return $this->recordMovement([
            'store_variant_id' => $storeVariant->id,
            'type' => 'sale',
            'quantity' => -abs($quantity), // negative
            'source_type' => Store::class,
            'source_id' => $storeVariant->store_id,
            'destination_type' => $customerId ? Customer::class : 'retail_customer',
            'destination_id' => $customerId,
            'reference_id' => $reference,
            'user_id' => $userId ?? auth()->id(),
        ]);
    }

    /**
     * Record a manual inventory adjustment (cycle count, damage, return).
     */
    public function recordAdjustment(
        StoreVariant $storeVariant,
        int $quantity,
        string $reason = 'Manual adjustment',
        ?int $userId = null
    ): InventoryMovement {
        return $this->recordMovement([
            'store_variant_id' => $storeVariant->id,
            'type' => 'adjustment',
            'quantity' => $quantity, // signed: can be positive or negative
            'source_type' => Store::class,
            'source_id' => $storeVariant->store_id,
            'destination_type' => null,
            'destination_id' => null,
            'reference_id' => $reason,
            'user_id' => $userId ?? auth()->id(),
        ]);
    }

    /**
     * Atomically transfer stock between two StoreVariants (e.g. across stores or warehouses).
     *
     * @throws InsufficientStockException
     */
    public function transferStock(
        StoreVariant $fromVariant,
        StoreVariant $toVariant,
        int $quantity,
        ?int $userId = null,
        ?string $notes = null
    ): Transfer {
        if ($quantity <= 0) {
            throw new InvalidArgumentException("Transfer quantity must be greater than zero.");
        }

        if ($fromVariant->id === $toVariant->id) {
            throw new InvalidArgumentException("Source and destination variants cannot be identical.");
        }

        /*
         * Domain check before anything is written.
         *
         * A move between two warehouses is bulk freight — a Shipment — and
         * writing it into `transfers` is what blurred the two domains in the
         * first place. MovementDomainService is the single authority on that
         * boundary, so this path asks it rather than restating the rule.
         */
        app(\App\Services\Fulfillment\MovementDomainService::class)->assertTransferLeg(
            Store::class,
            (int) $fromVariant->store_id,
            Store::class,
            (int) $toVariant->store_id,
        );

        return DB::transaction(function () use ($fromVariant, $toVariant, $quantity, $userId, $notes) {
            // 1. Verify source stock
            $availableStock = $this->getCurrentStock($fromVariant);
            if ($availableStock < $quantity) {
                throw new InsufficientStockException(
                    message: "Cannot transfer {$quantity} units. StoreVariant #{$fromVariant->id} only has {$availableStock} available.",
                    storeVariantId: $fromVariant->id,
                    requestedQuantity: $quantity,
                    availableStock: $availableStock
                );
            }

            // 2. Generate transfer reference
            $reference = 'TRF-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -5));

            // Ensure valid location IDs for legacy schema compatibility
            $fromLocationId = $fromVariant->store_id;
            $toLocationId = $toVariant->store_id;

            if (\Illuminate\Support\Facades\Schema::hasTable('item_inventory_locations')) {
                $fromLocation = \App\Models\StockKeeper\ItemInventoryLocation::firstOrCreate(
                    ['store_id' => $fromVariant->store_id],
                    ['name' => 'Store #' . $fromVariant->store_id]
                );
                $toLocation = \App\Models\StockKeeper\ItemInventoryLocation::firstOrCreate(
                    ['store_id' => $toVariant->store_id],
                    ['name' => 'Store #' . $toVariant->store_id]
                );
                $fromLocationId = $fromLocation->id;
                $toLocationId = $toLocation->id;
            }

            // 3. Create Transfer record
            $transfer = Transfer::create([
                'reference' => $reference,
                'store_variant_id' => $fromVariant->id,
                'item_variant_id' => $fromVariant->item_variant_id,
                'from_store_id' => $fromVariant->store_id,
                'to_store_id' => $toVariant->store_id,
                'from_location_id' => $fromLocationId,
                'to_location_id' => $toLocationId,
                // The endpoints every new reader uses; the two legacy columns
                // above stay populated for the screens that still read them.
                'source_location_type' => Store::class,
                'source_location_id' => $fromVariant->store_id,
                'destination_location_type' => Store::class,
                'destination_location_id' => $toVariant->store_id,
                'quantity' => $quantity,
                'origin' => Transfer::ORIGIN_MANUAL,
                'approval_state' => Transfer::APPROVAL_NOT_REQUIRED,
                'status' => 'completed',
                'initiated_by' => $userId ?? auth()->id(),
                'completed_at' => now(),
                'notes' => $notes,
            ]);

            // 4. Ledger entry: transfer_out from source
            $this->recordMovement([
                'store_variant_id' => $fromVariant->id,
                'type' => 'transfer_out',
                'quantity' => -abs($quantity),
                'source_type' => Store::class,
                'source_id' => $fromVariant->store_id,
                'destination_type' => Store::class,
                'destination_id' => $toVariant->store_id,
                'reference_id' => $reference,
                'user_id' => $userId ?? auth()->id(),
            ]);

            // 5. Ledger entry: transfer_in to destination
            $this->recordMovement([
                'store_variant_id' => $toVariant->id,
                'type' => 'transfer_in',
                'quantity' => abs($quantity),
                'source_type' => Store::class,
                'source_id' => $fromVariant->store_id,
                'destination_type' => Store::class,
                'destination_id' => $toVariant->store_id,
                'reference_id' => $reference,
                'user_id' => $userId ?? auth()->id(),
            ]);

            return $transfer;
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Ledger gateway (STOCK_PLAN.md §3)
    |--------------------------------------------------------------------------
    |
    | The only code meant to write item_stocks. Every method:
    |
    |   1. runs in a transaction;
    |   2. locks the item_variants rows involved, in ascending id order. That
    |      row is the per-variant mutex: it serialises every stock change and
    |      reservation for the variant, including the creation of a stock row
    |      that does not exist yet, and a fixed order means two writers can
    |      never deadlock against each other;
    |   3. refuses to take any location below zero — InsufficientStockException,
    |      never a silent clamp;
    |   4. writes one inventory_movements journal row.
    |
    | Capacity sweeps follow from ItemStockObserver, which watches the model
    | used here and runs after commit.
    |
    | Quantities are in the variant's own packaging unit (memory: duka-stock-ssot).
    |
    | Context keys accepted by every method:
    |   user_id    defaults to the authenticated user
    |   reason     short words: "Vendor delivery", "Cycle count"…
    |   reference  the model that caused it (sale item, transfer, shipment…)
    |   notes      free text
    |
    */

    /** Stock arriving from outside the network (a vendor, an opening count). */
    public function receive(int $itemVariantId, StockLocation|int $location, int $quantity, array $context = []): ItemStock
    {
        $this->assertPositive($quantity);

        return DB::transaction(function () use ($itemVariantId, $location, $quantity, $context): ItemStock {
            $this->lockVariants([$itemVariantId]);

            $leaf = $this->stockableLeaf($location);
            // Goods only reach Delivery's custody by being handed over.
            $this->assertNotTransit($leaf);

            return $this->applyDelta($itemVariantId, $leaf, $quantity, 'receive', $context);
        });
    }

    /** A signed correction: a count, damage, a found carton. */
    public function adjust(int $itemVariantId, StockLocation|int $location, int $delta, array $context = []): ItemStock
    {
        if ($delta === 0) {
            throw new InvalidArgumentException('An adjustment must change the quantity.');
        }

        return DB::transaction(function () use ($itemVariantId, $location, $delta, $context): ItemStock {
            $this->lockVariants([$itemVariantId]);

            return $this->applyDelta($itemVariantId, $this->stockableLeaf($location), $delta, 'adjust', $context + ['reason' => 'Adjustment']);
        });
    }

    /** Stock leaving a location into transit (a dispatched transfer or shipment). */
    public function moveOut(int $itemVariantId, StockLocation|int $location, int $quantity, array $context = []): ItemStock
    {
        $this->assertPositive($quantity);

        return DB::transaction(function () use ($itemVariantId, $location, $quantity, $context): ItemStock {
            $this->lockVariants([$itemVariantId]);

            return $this->applyDelta($itemVariantId, $this->stockableLeaf($location), -$quantity, 'move_out', $context);
        });
    }

    /** Stock arriving at a location out of transit (a received transfer or shipment). */
    public function moveIn(int $itemVariantId, StockLocation|int $location, int $quantity, array $context = []): ItemStock
    {
        $this->assertPositive($quantity);

        return DB::transaction(function () use ($itemVariantId, $location, $quantity, $context): ItemStock {
            $this->lockVariants([$itemVariantId]);

            return $this->applyDelta($itemVariantId, $this->stockableLeaf($location), $quantity, 'move_in', $context);
        });
    }

    /**
     * Out of one location and into another in one step (shelf ↔ floor, a
     * same-day hand-carry). Conserves the variant's total by construction.
     *
     * @return array{0: ItemStock, 1: ItemStock} [source row, destination row]
     */
    public function move(int $itemVariantId, StockLocation|int $from, StockLocation|int $to, int $quantity, array $context = []): array
    {
        $this->assertPositive($quantity);

        return DB::transaction(function () use ($itemVariantId, $from, $to, $quantity, $context): array {
            $this->lockVariants([$itemVariantId]);

            $source = $this->stockableLeaf($from);
            $destination = $this->stockableLeaf($to);

            if ($source->is($destination)) {
                throw new InvalidArgumentException('A move needs two different locations.');
            }

            return [
                $this->applyDelta($itemVariantId, $source, -$quantity, 'move_out', $context),
                $this->applyDelta($itemVariantId, $destination, $quantity, 'move_in', $context),
            ];
        });
    }

    /**
     * Promise units at a store (shelf + floor together) to a sale line.
     *
     * Succeeds only while on hand − open reservations still covers the
     * request, checked under the variant lock so two checkouts racing for the
     * last unit cannot both win.
     *
     * @param  array{sale_item_id?: int|null, expires_at?: \DateTimeInterface|null}|array<string, mixed>  $context
     */
    public function reserve(int $itemVariantId, Store|int $store, int $quantity, array $context = []): StockReservation
    {
        $this->assertPositive($quantity);
        $storeId = $store instanceof Store ? (int) $store->id : $store;

        return DB::transaction(function () use ($itemVariantId, $storeId, $quantity, $context): StockReservation {
            $this->lockVariants([$itemVariantId]);

            $available = $this->availableAtStore($itemVariantId, $storeId);

            if ($available < $quantity) {
                throw InsufficientStockException::atLocation($itemVariantId, "store #{$storeId}", $quantity, $available);
            }

            $reservation = StockReservation::create([
                'sale_item_id' => $context['sale_item_id'] ?? null,
                'item_variant_id' => $itemVariantId,
                'store_id' => $storeId,
                'quantity' => $quantity,
                'status' => StockReservation::STATUS_OPEN,
                'expires_at' => $context['expires_at'] ?? null,
                'user_id' => $context['user_id'] ?? auth()->id(),
            ]);

            $this->journalReservation($reservation, -$quantity, 'reserve', $available - $quantity, $context);

            return $reservation;
        });
    }

    /**
     * Promise units held at one leaf — a hub serving a line its store cannot,
     * on a delay the buyer agreed to. Succeeds only while that leaf's on hand
     * less its open holds covers the request.
     */
    public function reserveAt(int $itemVariantId, StockLocation|int $location, Store|int $store, int $quantity, array $context = []): StockReservation
    {
        $this->assertPositive($quantity);
        $storeId = $store instanceof Store ? (int) $store->id : $store;

        return DB::transaction(function () use ($itemVariantId, $location, $storeId, $quantity, $context): StockReservation {
            $this->lockVariants([$itemVariantId]);

            $leaf = $this->stockableLeaf($location);
            $available = $this->availableAt($itemVariantId, $leaf);

            if ($available < $quantity) {
                throw InsufficientStockException::atLocation($itemVariantId, "{$leaf->name} ({$leaf->code})", $quantity, $available);
            }

            $reservation = StockReservation::create([
                'sale_item_id' => $context['sale_item_id'] ?? null,
                'item_variant_id' => $itemVariantId,
                'store_id' => $storeId,
                'stock_location_id' => $leaf->id,
                'quantity' => $quantity,
                'status' => StockReservation::STATUS_OPEN,
                'expires_at' => $context['expires_at'] ?? null,
                'user_id' => $context['user_id'] ?? auth()->id(),
            ]);

            $this->journalReservation($reservation, -$quantity, 'reserve', $available - $quantity, $context);

            return $reservation;
        });
    }

    /** On hand at one leaf, less the open holds placed on that leaf. */
    public function availableAt(int $itemVariantId, StockLocation|int $location): int
    {
        $leafId = $location instanceof StockLocation ? (int) $location->id : $location;

        $onHand = (int) ItemStock::query()
            ->where('item_variant_id', $itemVariantId)
            ->where('stock_location_id', $leafId)
            ->sum('quantity');

        $held = (int) StockReservation::query()
            ->open()
            ->where('item_variant_id', $itemVariantId)
            ->where('stock_location_id', $leafId)
            ->sum('quantity');

        return $onHand - $held;
    }

    /** Give a reservation's units back. Releasing twice is a no-op. */
    public function release(StockReservation|int $reservation, array $context = []): StockReservation
    {
        $reservationId = $reservation instanceof StockReservation ? (int) $reservation->id : $reservation;

        return DB::transaction(function () use ($reservationId, $context): StockReservation {
            $reservation = StockReservation::query()->findOrFail($reservationId);
            $this->lockVariants([$reservation->item_variant_id]);
            $reservation->refresh();

            if (! $reservation->isOpen()) {
                return $reservation;
            }

            $reservation->update([
                'status' => StockReservation::STATUS_RELEASED,
                'released_at' => now(),
            ]);

            $this->journalReservation(
                $reservation,
                $reservation->quantity,
                'release',
                $this->availableFor($reservation),
                $context,
            );

            return $reservation;
        });
    }

    /**
     * Turn a reservation into a real debit from the leaf the picker confirmed.
     *
     * Any stockable leaf may be picked from (the store's shelf or floor, its
     * remote hub, a main hub). Picking fewer than reserved consumes the whole
     * reservation and frees the remainder.
     */
    public function pick(StockReservation|int $reservation, StockLocation|int $location, ?int $quantity = null, array $context = []): ItemStock
    {
        $reservationId = $reservation instanceof StockReservation ? (int) $reservation->id : $reservation;

        return DB::transaction(function () use ($reservationId, $location, $quantity, $context): ItemStock {
            $reservation = StockReservation::query()->findOrFail($reservationId);
            $this->lockVariants([$reservation->item_variant_id]);
            $reservation->refresh();

            if (! $reservation->isOpen()) {
                throw new InvalidArgumentException("Reservation #{$reservation->id} is {$reservation->status}, not open.");
            }

            $quantity ??= $reservation->quantity;
            $this->assertPositive($quantity);

            if ($quantity > $reservation->quantity) {
                throw new InvalidArgumentException("Cannot pick {$quantity}: reservation #{$reservation->id} holds {$reservation->quantity}.");
            }

            $leaf = $this->stockableLeaf($location);
            $pickContext = $context + ['reference' => $reservation->saleItem ?? $reservation];
            $stock = $this->applyDelta($reservation->item_variant_id, $leaf, -$quantity, 'pick', $pickContext);

            // Picked goods go to Delivery's custody until the courier hands
            // them to the customer (deliverFromCourier) or brings them back.
            $this->applyDelta($reservation->item_variant_id, $this->transit(), $quantity, 'custody_in', $pickContext);

            $unpicked = $reservation->quantity - $quantity;

            $reservation->update([
                'status' => StockReservation::STATUS_PICKED,
                'quantity' => $quantity,
                'picked_stock_location_id' => $leaf->id,
                'picked_at' => now(),
            ]);

            if ($unpicked > 0) {
                $this->journalReservation(
                    $reservation,
                    $unpicked,
                    'release',
                    $this->availableFor($reservation),
                    ['reason' => 'Short pick'] + $context,
                );
            }

            return $stock;
        });
    }

    /**
     * A Pick & Pack debit for a line that holds no reservation (an order
     * placed before reservations existed). Same rules: locked, never negative.
     */
    public function pickWithoutReservation(int $itemVariantId, StockLocation|int $location, int $quantity, array $context = []): ItemStock
    {
        $this->assertPositive($quantity);

        return DB::transaction(function () use ($itemVariantId, $location, $quantity, $context): ItemStock {
            $this->lockVariants([$itemVariantId]);

            $stock = $this->applyDelta($itemVariantId, $this->stockableLeaf($location), -$quantity, 'pick', $context);
            $this->applyDelta($itemVariantId, $this->transit(), $quantity, 'custody_in', $context);

            return $stock;
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Custody: goods in a courier's hands
    |--------------------------------------------------------------------------
    |
    | Every movement between two sites, and every customer order, passes
    | through the "In Delivery" location. Each hand-off is two journal rows in
    | one locked step, so the network total is the same before and after it:
    |
    |   handToCourier       origin −q (move_out)        In Delivery +q (custody_in)
    |   handOverFromCourier In Delivery −q (custody_out) destination +q (move_in)
    |   returnFromCourier   In Delivery −q (custody_out) origin +q (return)
    |   deliverFromCourier  In Delivery −q (deliver)    — leaves the network
    |
    | The courier is recorded on the custody row (source/destination = User).
    |
    */

    /** The origin hands goods to a courier. */
    public function handToCourier(int $itemVariantId, StockLocation|int $from, int $quantity, ?int $courierId, array $context = []): void
    {
        $this->assertPositive($quantity);

        DB::transaction(function () use ($itemVariantId, $from, $quantity, $courierId, $context): void {
            $this->lockVariants([$itemVariantId]);

            $origin = $this->stockableLeaf($from);
            $this->assertNotTransit($origin);

            $this->applyDelta($itemVariantId, $origin, -$quantity, 'move_out', $context);
            $this->applyDelta($itemVariantId, $this->transit(), $quantity, 'custody_in', $context + ['courier_id' => $courierId]);
        });
    }

    /** The courier hands goods to their destination. */
    public function handOverFromCourier(int $itemVariantId, StockLocation|int $to, int $quantity, ?int $courierId, array $context = []): void
    {
        $this->assertPositive($quantity);

        DB::transaction(function () use ($itemVariantId, $to, $quantity, $courierId, $context): void {
            $this->lockVariants([$itemVariantId]);

            $destination = $this->stockableLeaf($to);
            $this->assertNotTransit($destination);

            $this->applyDelta($itemVariantId, $this->transit(), -$quantity, 'custody_out', $context + ['courier_id' => $courierId]);
            $this->applyDelta($itemVariantId, $destination, $quantity, 'move_in', $context);
        });
    }

    /** The courier brings goods back to where they came from. */
    public function returnFromCourier(int $itemVariantId, StockLocation|int $to, int $quantity, ?int $courierId, array $context = []): void
    {
        $this->assertPositive($quantity);

        DB::transaction(function () use ($itemVariantId, $to, $quantity, $courierId, $context): void {
            $this->lockVariants([$itemVariantId]);

            $origin = $this->stockableLeaf($to);
            $this->assertNotTransit($origin);

            $this->applyDelta($itemVariantId, $this->transit(), -$quantity, 'custody_out', $context + ['courier_id' => $courierId]);
            $this->applyDelta($itemVariantId, $origin, $quantity, 'return', $context);
        });
    }

    /** The courier hands goods to the customer: they leave the network. */
    public function deliverFromCourier(int $itemVariantId, int $quantity, ?int $courierId, array $context = []): void
    {
        $this->assertPositive($quantity);

        DB::transaction(function () use ($itemVariantId, $quantity, $courierId, $context): void {
            $this->lockVariants([$itemVariantId]);

            $this->applyDelta($itemVariantId, $this->transit(), -$quantity, 'deliver', $context + ['courier_id' => $courierId]);
        });
    }

    /** Units of a variant currently in Delivery's custody. */
    public function inCustody(int $itemVariantId): int
    {
        return (int) ItemStock::query()
            ->where('item_variant_id', $itemVariantId)
            ->where('stock_location_id', $this->transit()->id)
            ->sum('quantity');
    }

    private function transit(): StockLocation
    {
        return app(StockLocationTree::class)->transit();
    }

    private function assertNotTransit(StockLocation $leaf): void
    {
        if ($leaf->isTransit()) {
            throw new InvalidArgumentException('Name the place the goods come from or go to, not Delivery itself.');
        }
    }

    /** Units of a variant on a store's shelf + floor. */
    public function onHandAtStore(int $itemVariantId, int $storeId): int
    {
        return (int) ItemStock::query()
            ->where('item_variant_id', $itemVariantId)
            ->whereIn('stock_location_id', $this->storeLeafIds($storeId))
            ->sum('quantity');
    }

    /** On hand at the store, less what open reservations already promise. */
    public function availableAtStore(int $itemVariantId, int $storeId): int
    {
        // Store-level holds only; a hub hold placed for this store's order
        // draws on the hub, not on the counter.
        $reserved = (int) StockReservation::query()
            ->open()
            ->where('item_variant_id', $itemVariantId)
            ->where('store_id', $storeId)
            ->whereNull('stock_location_id')
            ->sum('quantity');

        return $this->onHandAtStore($itemVariantId, $storeId) - $reserved;
    }

    /** Release every open reservation whose hold has expired. Returns how many. */
    public function releaseStaleReservations(?\DateTimeInterface $now = null): int
    {
        $released = 0;

        StockReservation::query()
            ->open()
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', $now ?? now())
            ->orderBy('id')
            ->pluck('id')
            ->each(function (int $id) use (&$released): void {
                if ($this->release($id, ['reason' => 'Reservation expired'])->status === StockReservation::STATUS_RELEASED) {
                    $released++;
                }
            });

        return $released;
    }

    /**
     * The one place a stock row's quantity changes. Caller holds the variant lock.
     */
    private function applyDelta(int $itemVariantId, StockLocation $leaf, int $delta, string $type, array $context): ItemStock
    {
        $stock = ItemStock::query()
            ->where('item_variant_id', $itemVariantId)
            ->where('stock_location_id', $leaf->id)
            ->lockForUpdate()
            ->first();

        $current = (int) ($stock?->quantity ?? 0);
        $next = $current + $delta;

        if ($next < 0) {
            throw InsufficientStockException::atLocation($itemVariantId, "{$leaf->name} ({$leaf->code})", -$delta, $current);
        }

        if ($stock === null) {
            [$legacyType, $legacyId] = app(StockLocationTree::class)->legacyAddressFor($leaf);

            $stock = new ItemStock([
                'item_variant_id' => $itemVariantId,
                'location_type' => $legacyType,
                'location_id' => $legacyId,
                'stock_location_id' => $leaf->id,
            ]);
        }

        $stock->quantity = $next;
        $stock->save();

        $reference = $context['reference'] ?? null;
        $courierId = $context['courier_id'] ?? null;
        $towardsCourier = $courierId !== null && $delta > 0;
        $fromCourier = $courierId !== null && $delta < 0;

        InventoryMovement::create([
            // Custody rows name the courier holding the goods.
            'source_type' => $fromCourier ? \App\Models\Auth\User::class : null,
            'source_id' => $fromCourier ? $courierId : null,
            'destination_type' => $towardsCourier ? \App\Models\Auth\User::class : null,
            'destination_id' => $towardsCourier ? $courierId : null,
            'item_variant_id' => $itemVariantId,
            'stock_location_id' => $leaf->id,
            'type' => $type,
            'reason' => $context['reason'] ?? null,
            'quantity' => $delta,
            'balance_after' => $next,
            'reference_type' => $reference instanceof Model ? $reference->getMorphClass() : ($context['reference_type'] ?? null),
            'reference_id' => $reference instanceof Model ? (string) $reference->getKey() : ($context['reference_id'] ?? null),
            'user_id' => $context['user_id'] ?? auth()->id(),
            'notes' => $context['notes'] ?? null,
        ]);

        return $stock;
    }

    /** What is free where this reservation holds: its leaf, or its store. */
    private function availableFor(StockReservation $reservation): int
    {
        return $reservation->stock_location_id !== null
            ? $this->availableAt($reservation->item_variant_id, $reservation->stock_location_id)
            : $this->availableAtStore($reservation->item_variant_id, $reservation->store_id);
    }

    /**
     * Reservations journal against the store's group node, or against the hub
     * leaf a hub hold sits on. They change what can be sold, not what is on
     * hand, so a leaf's running balance is the sum of its on-hand verbs only
     * (receive, adjust, move_out, move_in, pick) — never reserve/release.
     * balance_after on these rows is the availability afterwards.
     */
    private function journalReservation(StockReservation $reservation, int $delta, string $type, int $availableAfter, array $context): void
    {
        InventoryMovement::create([
            'item_variant_id' => $reservation->item_variant_id,
            'stock_location_id' => $reservation->stock_location_id ?? StockLocation::query()
                ->where('store_id', $reservation->store_id)
                ->where('kind', StockLocation::KIND_STORE)
                ->value('id'),
            'type' => $type,
            'reason' => $context['reason'] ?? null,
            'quantity' => $delta,
            'balance_after' => $availableAfter,
            'reference_type' => $reservation->getMorphClass(),
            'reference_id' => (string) $reservation->id,
            'user_id' => $context['user_id'] ?? auth()->id(),
            'notes' => $context['notes'] ?? null,
        ]);
    }

    /** @param  array<int>  $itemVariantIds */
    private function lockVariants(array $itemVariantIds): void
    {
        $ids = array_values(array_unique(array_map('intval', $itemVariantIds)));
        sort($ids);

        $locked = DB::table('item_variants')->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->pluck('id');

        if ($locked->count() !== count($ids)) {
            throw new InvalidArgumentException('Unknown item variant: '.implode(', ', array_diff($ids, $locked->map('intval')->all())));
        }
    }

    private function stockableLeaf(StockLocation|int $location): StockLocation
    {
        $leaf = $location instanceof StockLocation ? $location : StockLocation::query()->findOrFail($location);

        if (! $leaf->is_stockable) {
            throw new InvalidArgumentException("{$leaf->name} ({$leaf->code}) is not a stockable location.");
        }

        return $leaf;
    }

    /** @return array<int> the store's shelf and floor */
    private function storeLeafIds(int $storeId): array
    {
        return StockLocation::query()
            ->where('store_id', $storeId)
            ->whereIn('kind', [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM])
            ->pluck('id')
            ->all();
    }

    private function assertPositive(int $quantity): void
    {
        if ($quantity <= 0) {
            throw new InvalidArgumentException('Quantity must be greater than zero.');
        }
    }
}
