<?php

namespace App\Models\Store;

use App\Models\Auth\Customer;
use App\Models\Store\StoreVariant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StoreVariantCustomerPrice extends Model
{
    protected $table = 'store_variants_customer_prices';

    protected $fillable = [
        'store_variant_id',
        'customer_id',
        // 🎯 UPDATED: Removed individual flat decimal fields, replaced with your JSON matrix
        'pricing_matrix',
        'active',
    ];

    /**
     * 🎯 THE CASTS DEFINITION
     * Forces Laravel to parse the customer's negotiated packaging contract block
     * straight into a clean, searchable multidimensional array.
     */
    protected $casts = [
        'pricing_matrix' => 'array',
        'active' => 'boolean',
    ];

    public function storeVariant(): BelongsTo
    {
        return $this->belongsTo(StoreVariant::class, 'store_variant_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }
}