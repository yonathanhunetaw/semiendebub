<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Item\ItemVariant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Part (or all) of one purchase order line travelling in a consignment.
 * Quantity is in the variant's own packaging unit, like item_stocks.
 */
class ConsignmentLine extends Model
{
    protected $fillable = [
        'consignment_id', 'purchase_line_id', 'item_variant_id', 'quantity', 'cbm', 'weight_kg', 'goods_value_etb',
        'received_quantity', 'damaged_quantity', 'receipt_note', 'landed_unit_etb',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'received_quantity' => 'integer',
        'damaged_quantity' => 'integer',
        'landed_unit_etb' => 'decimal:4',
        'cbm' => 'decimal:4',
        'weight_kg' => 'decimal:3',
        'goods_value_etb' => 'decimal:2',
    ];

    public function consignment(): BelongsTo
    {
        return $this->belongsTo(Consignment::class);
    }

    public function purchaseLine(): BelongsTo
    {
        return $this->belongsTo(PurchaseLine::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }

    /** Units that arrived whole (null until received). */
    public function goodUnits(): ?int
    {
        return $this->received_quantity === null ? null : max(0, (int) $this->received_quantity - (int) $this->damaged_quantity);
    }
}
