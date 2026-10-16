<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Item\ItemVariant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One SKU on a purchase order. Quantity is in the variant's own packaging
 * unit (like item_stocks); unit_price is in the order's currency.
 */
class PurchaseLine extends Model
{
    protected $fillable = [
        'purchase_id',
        'item_variant_id',
        'supplier_sku',
        'quantity',
        'unit_price',
        'line_total',
        'cbm',
        'weight_kg',
        'received_quantity',
        'notes',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price' => 'decimal:4',
        'line_total' => 'decimal:2',
        'cbm' => 'decimal:4',
        'weight_kg' => 'decimal:3',
        'received_quantity' => 'integer',
    ];

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }
}
