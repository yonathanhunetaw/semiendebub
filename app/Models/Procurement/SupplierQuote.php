<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * What a supplier asks for a product idea, per piece, and what bringing it
 * to the store would cost (`estimate`, saved by SupplierQuoteService so a
 * later change of rates does not rewrite it).
 */
class SupplierQuote extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_idea_id',
        'supplier_id',
        'currency',
        'exchange_rate',
        'unit_price',
        'moq',
        'pieces_per_carton',
        'cbm_per_carton',
        'kg_per_carton',
        'lead_days',
        'valid_until',
        'hs_code',
        'freight_route_id',
        'quantity',
        'overrides',
        'estimate',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'exchange_rate' => 'decimal:4',
        'unit_price' => 'decimal:4',
        'moq' => 'integer',
        'pieces_per_carton' => 'integer',
        'cbm_per_carton' => 'decimal:4',
        'kg_per_carton' => 'decimal:3',
        'lead_days' => 'integer',
        'valid_until' => 'date',
        'quantity' => 'integer',
        'overrides' => 'array',
        'estimate' => 'array',
    ];

    public function idea(): BelongsTo
    {
        return $this->belongsTo(ProductIdea::class, 'product_idea_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function route(): BelongsTo
    {
        return $this->belongsTo(FreightRoute::class, 'freight_route_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
