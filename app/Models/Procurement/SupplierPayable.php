<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * One charge owed to a supplier: a purchase order's goods (P2), later a
 * container's freight or customs. What is still owed is computed by
 * App\Services\Procurement\PayablesLedger, never stored.
 */
class SupplierPayable extends Model
{
    public const KIND_GOODS = 'goods';

    public const KIND_FREIGHT = 'freight';

    public const KIND_CUSTOMS = 'customs';

    public const KIND_OTHER = 'other';

    protected $fillable = [
        'payable_type',
        'payable_id',
        'supplier_id',
        'kind',
        'description',
        'currency',
        'amount',
        'estimate_rate',
        'cancelled_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'estimate_rate' => 'decimal:6',
        'cancelled_at' => 'datetime',
    ];

    public function payable(): MorphTo
    {
        return $this->morphTo();
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class)->withTrashed();
    }

    public function installments(): HasMany
    {
        return $this->hasMany(PayableInstallment::class)->orderBy('sequence');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(SupplierPayment::class);
    }
}
