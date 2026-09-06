<?php

namespace App\Models\StockKeeper;

use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use App\Models\Store\StoreVariant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Builder;

class Transfer extends Model
{
    use HasFactory;

    protected $table = 'transfers';

    protected $fillable = [
        'reference',
        'item_variant_id',
        'store_variant_id',
        'from_store_id',
        'to_store_id',
        'from_location_id',
        'to_location_id',
        'quantity',
        'status',
        'initiated_by',
        'completed_at',
        'notes',
    ];

    public function fromStore(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Store\Store::class, 'from_store_id');
    }

    public function toStore(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Store\Store::class, 'to_store_id');
    }

    protected $casts = [
        'quantity' => 'integer',
        'completed_at' => 'datetime',
    ];

    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }

    public function storeVariant(): BelongsTo
    {
        return $this->belongsTo(StoreVariant::class, 'store_variant_id');
    }

    public function initiator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'initiated_by');
    }

    public function scopeCompleted(Builder $query): Builder
    {
        return $query->where('status', 'completed');
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', 'pending');
    }
}
