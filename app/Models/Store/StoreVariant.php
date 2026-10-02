<?php

namespace App\Models\Store;

use App\Models\Item\Item;
use App\Models\StockKeeper\ItemStock;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class StoreVariant extends Model
{
    use HasFactory;

    protected $fillable = [
        'item_id',
        'item_variant_id',
        'store_id',
        'stock',
        // 🎯 UPDATED: Replaced individual flat price fields with your new JSON matrix column
        'pricing_matrix',
        'manual_status',
        'forced_status',
        'status',
        'active',
    ];

    /**
     * 🎯 THE CASTS DEFINITION
     * This forces Laravel to turn your JSON matrix database text into a clean
     * multi-dimensional PHP array automatically whenever you fetch it.
     */
    protected $casts = [
        'pricing_matrix' => 'array',
    ];

    /**
     * Fix for BadMethodCallException: sellerPrices()
     * This allows PriceProvider to calculate the price ladder tiers.
     */
    public function sellerPrices(): HasMany
    {
        return $this->hasMany(StoreVariantSellerPrice::class, 'store_variant_id');
    }

    /**
     * Get the customer-specific price tiers.
     */
    public function customerPrices(): HasMany
    {
        return $this->hasMany(StoreVariantCustomerPrice::class, 'store_variant_id');
    }

    /**
     * Get the individual price (if stored separately).
     */
    public function individualPrice()
    {
        return $this->hasOne(StoreVariantIndividualPrice::class, 'store_variant_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    /**
     * EVERY positional stock row for this variant — at ANY store and ANY
     * warehouse, not just this one.
     *
     * The join is item_variant_id to item_variant_id, and item_stocks is keyed
     * by (item_variant_id, location_type, location_id). Nothing in that key
     * mentions a store, so this relation cannot narrow itself to the store
     * this StoreVariant belongs to. Summing it unconstrained reports the whole
     * company's holding of the variant as if it sat in one shop: for variant
     * 939 it returned 71 (43 + 16 + 12 across three stores) where this store
     * holds 43.
     *
     * Laravel cannot express the composite key as a relation, so the constraint
     * has to come from the caller. Every eager load must supply it:
     *
     *     ->with(['stocks' => fn ($q) => $q
     *         ->where('location_type', Store::class)
     *         ->where('location_id', $store->id)])
     *
     * For a single model, call stockAtStore() instead and let it do this.
     */
    public function stocks(): HasMany
    {
        return $this->hasMany(ItemStock::class, 'item_variant_id', 'item_variant_id');
    }

    /**
     * Units of this variant positioned at this variant's own store.
     *
     * The figure the store's own screens mean by "stock". Reads the loaded
     * relation when it is there and already constrained, so it adds no query
     * to a list that eager-loaded correctly.
     */
    public function stockAtStore(): int
    {
        if ($this->relationLoaded('stocks')) {
            return (int) $this->stocks
                ->where('location_type', Store::class)
                ->where('location_id', $this->store_id)
                ->sum('quantity');
        }

        return (int) $this->stocks()
            ->where('location_type', Store::class)
            ->where('location_id', $this->store_id)
            ->sum('quantity');
    }

    /**
     * Computed Status Logic
     * Used by $variant->status = $storeVariant->computed_status in your controller.
     */
    public function getComputedStatusAttribute(): string
    {
        if ($this->manual_status === 'forced') {
            return $this->forced_status;
        }

        // Logic for 'auto' status (e.g., check stock or parent item status)
        return $this->status ?? 'active';
    }

    public function getStatusAttribute()
    {
        return $this->active ? 'active' : 'inactive';
    }
    public function inventoryMovements(): HasMany
    {
        return $this->hasMany(\App\Models\Inventory\InventoryMovement::class, 'store_variant_id');
    }

    /**
     * Dynamic Stock Balance calculated from the SSOT inventory movements ledger.
     */
    public function getCurrentStockAttribute(): int
    {
        return (int) $this->inventoryMovements()->sum('quantity');
    }

    public function scopeInStock($query)
    {
        return $query->whereHas('inventoryMovements', function ($q) {
            $q->havingRaw('SUM(quantity) > 0');
        });
    }

    // In StoreVariant.php (Model)
    public function getIsDiscountedAttribute()
    {
        $matrix = $this->pricing_matrix;
        return isset($matrix['discount_price']) && $matrix['discount_price'] < $matrix['price'];
    }
}