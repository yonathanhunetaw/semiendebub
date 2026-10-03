<?php

namespace App\Models\Inventory;

use App\Models\Auth\User;
use App\Models\Store\StoreVariant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\Builder;

class InventoryMovement extends Model
{
    use HasFactory;

    protected $table = 'inventory_movements';

    protected $fillable = [
        'store_variant_id',
        'item_variant_id',
        'stock_location_id',
        'type',
        'reason',
        'quantity',
        'balance_after',
        'source_type',
        'source_id',
        'destination_type',
        'destination_id',
        'reference_type',
        'reference_id',
        'user_id',
        'notes',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'balance_after' => 'integer',
        'item_variant_id' => 'integer',
        'stock_location_id' => 'integer',
    ];

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function storeVariant(): BelongsTo
    {
        return $this->belongsTo(StoreVariant::class, 'store_variant_id');
    }

    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Item\ItemVariant::class);
    }

    public function stockLocation(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function source(): MorphTo
    {
        return $this->morphTo(__FUNCTION__, 'source_type', 'source_id');
    }

    public function destination(): MorphTo
    {
        return $this->morphTo(__FUNCTION__, 'destination_type', 'destination_id');
    }

    /*
    |--------------------------------------------------------------------------
    | Scopes
    |--------------------------------------------------------------------------
    */

    public function scopeForStoreVariant(Builder $query, int $storeVariantId): Builder
    {
        return $query->where('store_variant_id', $storeVariantId);
    }

    public function scopeOfType(Builder $query, string $type): Builder
    {
        return $query->where('type', $type);
    }

    public function scopePurchases(Builder $query): Builder
    {
        return $query->where('type', 'purchase');
    }

    public function scopeSales(Builder $query): Builder
    {
        return $query->where('type', 'sale');
    }

    public function scopeTransfersIn(Builder $query): Builder
    {
        return $query->where('type', 'transfer_in');
    }

    public function scopeTransfersOut(Builder $query): Builder
    {
        return $query->where('type', 'transfer_out');
    }

    public function scopeAdjustments(Builder $query): Builder
    {
        return $query->where('type', 'adjustment');
    }
}
