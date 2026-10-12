<?php

declare(strict_types=1);

namespace App\Models\Inventory;

use App\Models\Item\ItemVariant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One variant on a stocktake: what the ledger held when the count began, and
 * what was counted, both in the variant's own packaging unit.
 */
class StocktakeLine extends Model
{
    protected $fillable = [
        'stocktake_id',
        'item_variant_id',
        'expected',
        'counted',
        'counted_by',
        'counted_at',
    ];

    protected $casts = [
        'expected' => 'integer',
        'counted' => 'integer',
        'counted_at' => 'datetime',
    ];

    public function stocktake(): BelongsTo
    {
        return $this->belongsTo(Stocktake::class);
    }

    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class);
    }
}
