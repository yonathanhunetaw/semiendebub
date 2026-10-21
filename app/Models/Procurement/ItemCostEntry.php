<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One change of a SKU's cost: the batch that came in, what was on hand
 * before at what cost, and the weighted average after (ItemCosting).
 */
class ItemCostEntry extends Model
{
    protected $fillable = ['item_variant_id', 'consignment_line_id', 'quantity', 'batch_unit_cost', 'on_hand_before', 'cost_before', 'cost_after', 'created_by'];

    protected $casts = [
        'quantity' => 'integer',
        'batch_unit_cost' => 'decimal:4',
        'on_hand_before' => 'integer',
        'cost_before' => 'decimal:4',
        'cost_after' => 'decimal:4',
    ];

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }

    public function consignmentLine(): BelongsTo
    {
        return $this->belongsTo(ConsignmentLine::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
