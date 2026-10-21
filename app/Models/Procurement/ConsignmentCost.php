<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Money paid on a consignment's way in: freight, a customs tax, port fees…
 * One person records it, someone else (finance or a global admin) confirms
 * it; only confirmed costs count (ConsignmentService).
 */
class ConsignmentCost extends Model
{
    /** Kind => [label, default allocation, recoverable]. The keys match LandedCostEstimator's lines. */
    public const KINDS = [
        'storage' => ['Overseas storage', 'cbm', false],
        'freight' => ['Sea freight', 'cbm', false],
        'insurance' => ['Insurance', 'value', false],
        'duty' => ['Customs duty', 'value', false],
        'excise' => ['Excise tax', 'value', false],
        'vat' => ['VAT (claimed back)', 'value', true],
        'surtax' => ['Surtax', 'value', false],
        'withholding' => ['Withholding (claimed back)', 'value', true],
        'other' => ['Other levies', 'value', false],
        'port' => ['Port & clearing', 'cbm', false],
        'land' => ['Transport to the land port', 'cbm', false],
        'to_store' => ['Main store to store', 'cbm', false],
        'misc' => ['Something else', 'value', false],
    ];

    public const ALLOCATIONS = ['cbm', 'value', 'weight'];

    public const PENDING = 'pending';

    public const CONFIRMED = 'confirmed';

    public const REJECTED = 'rejected';

    protected $fillable = [
        'consignment_id',
        'stage',
        'kind',
        'description',
        'currency',
        'exchange_rate',
        'amount',
        'amount_etb',
        'allocation',
        'recoverable',
        'reference',
        'paid_on',
        'recorded_by',
        'confirmed_by',
        'confirmed_at',
        'rejected_by',
        'rejected_at',
        'reject_reason',
    ];

    protected $casts = [
        'exchange_rate' => 'decimal:4',
        'amount' => 'decimal:2',
        'amount_etb' => 'decimal:2',
        'recoverable' => 'boolean',
        'paid_on' => 'date',
        'confirmed_at' => 'datetime',
        'rejected_at' => 'datetime',
    ];

    public function consignment(): BelongsTo
    {
        return $this->belongsTo(Consignment::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function confirmer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function state(): string
    {
        return match (true) {
            $this->confirmed_at !== null => self::CONFIRMED,
            $this->rejected_at !== null => self::REJECTED,
            default => self::PENDING,
        };
    }

    public function label(): string
    {
        return self::KINDS[$this->kind][0] ?? ucfirst((string) $this->kind);
    }
}
