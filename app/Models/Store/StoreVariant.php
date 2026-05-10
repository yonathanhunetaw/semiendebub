<?php

namespace App\Models\Store;

use App\Models\Item\Item;
use App\Models\StockKeeper\ItemStock; // Fixed namespace based on your previous snippet
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StoreVariant extends Model
{
    protected $fillable = [
        'item_id',
        'item_variant_id',
        'store_id',
        'stock',
        'price',
        'discount_price',
        'discount_ends_at',
        'manual_status',
        'forced_status',
        'status',
    ];

    /**
     * Fix for BadMethodCallException: sellerPrices()
     * This allows PriceProvider to calculate the price ladder tiers.
     */
    public function sellerPrices(): HasMany
    {
        // Adjust the class name if your pricing model is named differently (e.g., SellerPrice)
        return $this->hasMany(\App\Models\Price\SellerPrice::class, 'store_variant_id');
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

    public function stocks(): HasMany
    {
        // Note: Using item_variant_id here links stocks across different stores
        // if they share the same variant ID.
        return $this->hasMany(ItemStock::class, 'item_variant_id', 'item_variant_id');
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
}
