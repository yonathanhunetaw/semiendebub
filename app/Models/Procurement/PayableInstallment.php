<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One step of a payable's schedule: an amount and when it falls due. The due
 * date itself is computed (PayablesLedger::dueDate) from the rule and the
 * order's events, so a shipping date set later moves it automatically.
 */
class PayableInstallment extends Model
{
    public const DUE_ON_ORDER = 'on_order';

    public const DUE_AFTER_ORDER = 'after_order';

    public const DUE_AFTER_SHIPPING = 'after_shipping';

    public const DUE_AFTER_ARRIVAL = 'after_arrival';

    public const DUE_ON_DATE = 'on_date';

    public const DUE_RULES = [
        self::DUE_ON_ORDER,
        self::DUE_AFTER_ORDER,
        self::DUE_AFTER_SHIPPING,
        self::DUE_AFTER_ARRIVAL,
        self::DUE_ON_DATE,
    ];

    protected $fillable = [
        'supplier_payable_id',
        'sequence',
        'label',
        'percent',
        'amount',
        'due_rule',
        'due_days',
        'due_date',
    ];

    protected $casts = [
        'sequence' => 'integer',
        'percent' => 'decimal:4',
        'amount' => 'decimal:2',
        'due_days' => 'integer',
        'due_date' => 'date',
    ];

    public function supplierPayable(): BelongsTo
    {
        return $this->belongsTo(SupplierPayable::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(SupplierPayment::class);
    }
}
