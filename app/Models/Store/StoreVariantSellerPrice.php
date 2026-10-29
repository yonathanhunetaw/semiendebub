<?php

namespace App\Models\Store;

use App\Models\Store\StoreVariant;
use App\Models\Auth\User;
use App\Models\Store\Concerns\RecordsPriceChanges;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StoreVariantSellerPrice extends Model
{
    use RecordsPriceChanges;

    /** For the price history (price_changes.kind). */
    public const PRICE_KIND = PriceChange::KIND_SELLER;

    protected $table = 'store_variants_seller_prices';

    protected $fillable = [
        'store_variant_id',
        'seller_id',
        // 🎯 UPDATED: Replaced flat fields with your unified packaging JSON column matrix
        'pricing_matrix',
        'active',
    ];

    /**
     * 🎯 THE CASTS DEFINITION
     * Hydrates the seller-specific wholesale tiers into an array context instantly.
     */
    protected $casts = [
        'pricing_matrix' => 'array',
        'active' => 'boolean',
    ];

    public function storeVariants(): BelongsTo
    {
        return $this->belongsTo(StoreVariant::class, 'store_variant_id');
    }

    public function seller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'seller_id');
    }
}