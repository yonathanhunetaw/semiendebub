<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Goods we bought travelling together (a container, an air parcel), with
 * lines of one or more purchase orders. Stages move only through
 * App\Services\Procurement\ConsignmentService.
 *
 *   forming → overseas_warehouse → at_sea → sea_port → dry_port → received (PP5)
 */
class Consignment extends Model
{
    use HasFactory;

    public const FORMING = 'forming';

    public const RECEIVED = 'received';

    public const CANCELLED = 'cancelled';

    /** The stages goods are in the ledger at, in order (StockLocationTree::INBOUND_STAGES). */
    public const IN_TRANSIT = ['overseas_warehouse', 'at_sea', 'sea_port', 'dry_port'];

    public const STAGES = [self::FORMING, ...self::IN_TRANSIT, self::RECEIVED, self::CANCELLED];

    protected $fillable = [
        'reference',
        'freight_route_id',
        'container_number',
        'bill_of_lading',
        'stage',
        'stage_dates',
        'eta',
        'notes',
        'created_by',
        'received_location_id',
        'received_from',
        'received_at',
        'received_by',
        'costs_finalised_at',
        'costs_finalised_by',
    ];

    protected $casts = [
        'stage_dates' => 'array',
        'eta' => 'date',
        'received_at' => 'datetime',
        'costs_finalised_at' => 'datetime',
    ];

    public function receivedAt(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Inventory\StockLocation::class, 'received_location_id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function route(): BelongsTo
    {
        return $this->belongsTo(FreightRoute::class, 'freight_route_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(ConsignmentLine::class);
    }

    public function costs(): HasMany
    {
        return $this->hasMany(ConsignmentCost::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isInTransit(): bool
    {
        return in_array($this->stage, self::IN_TRANSIT, true);
    }
}
