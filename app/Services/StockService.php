<?php

namespace App\Services;

use App\Exceptions\InsufficientStockException;
use App\Models\Auth\Customer;
use App\Models\Inventory\InventoryMovement;
use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
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

        return (int) InventoryMovement::where('store_variant_id', $storeVariantId)
            ->sum('quantity');
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

        $totals = InventoryMovement::whereIn('store_variant_id', $storeVariantIds)
            ->groupBy('store_variant_id')
            ->selectRaw('store_variant_id, CAST(SUM(quantity) AS SIGNED) as total_stock')
            ->pluck('total_stock', 'store_variant_id')
            ->all();

        // Ensure all requested IDs exist in result with 0 default
        $result = [];
        foreach ($storeVariantIds as $id) {
            $result[$id] = (int) ($totals[$id] ?? 0);
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
                'quantity' => $quantity,
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
}
