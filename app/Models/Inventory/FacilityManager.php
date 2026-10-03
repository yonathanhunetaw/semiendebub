<?php

declare(strict_types=1);

namespace App\Models\Inventory;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * One manager's assignment to one facility.
 *
 * The facility is a morph because a warehouse is recorded two ways in this
 * system: as a `warehouses` row (a store's off-site unit) and as a `stores` row
 * of type central_warehouse / remote_warehouse. Both can be overseen, and
 * authorization has to work the same either way.
 *
 * @see \App\Models\Concerns\HasFacilityManagers for the two-manager ceiling.
 */
class FacilityManager extends Model
{
    use HasFactory;

    /** A facility may have at most this many managers. */
    public const MAX_PER_FACILITY = 2;

    protected $table = 'facility_managers';

    protected $fillable = [
        'facility_type',
        'facility_id',
        'user_id',
        'is_primary',
        'assigned_by',
    ];

    protected $casts = [
        'facility_id' => 'integer',
        'user_id' => 'integer',
        'is_primary' => 'boolean',
    ];

    public function facility(): MorphTo
    {
        return $this->morphTo();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function assigner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }
}
