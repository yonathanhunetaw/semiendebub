<?php

namespace App\Models\StockKeeper;

use App\Models\Auth\User;
use App\Models\Inventory\ItemInventoryLocation;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
        'dispatched_at',      // ← add
        'cancelled_at',       // ← add
        'cancelled_by',       // ← add
        'eta',                // ← add
        'notes',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'completed_at' => 'datetime',
        'dispatched_at' => 'datetime',   // ← add
        'cancelled_at' => 'datetime',   // ← add
        'eta' => 'datetime',   // ← add
    ];

    // ─────────────────────────────────────────────────────────────────────
    // Relations
    // ─────────────────────────────────────────────────────────────────────

    public function fromStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'from_store_id');
    }

    public function toStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'to_store_id');
    }

    public function fromLocation(): BelongsTo
    {
        return $this->belongsTo(ItemInventoryLocation::class, 'from_location_id');
    }

    public function toLocation(): BelongsTo
    {
        return $this->belongsTo(ItemInventoryLocation::class, 'to_location_id');
    }

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

    // ─────────────────────────────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────────────────────────────

    public function scopeCompleted(Builder $query): Builder
    {
        return $query->where('status', 'completed');
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', 'pending');
    }

    // ─────────────────────────────────────────────────────────────────────
    // Accessors
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Frontend UI still speaks "queued" (matching the original design),
     * but the DB enum is 'pending'. Translate on the way out.
     */
    public function getUiStatusAttribute(): string
    {
        return $this->status === 'pending' ? 'queued' : $this->status;
    }
}