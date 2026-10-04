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
 * A facility may have any number of managers. Each assignment carries its own
 * tick boxes (`abilities`): what that manager may do there. NULL means every
 * ability — the state of every assignment made before the boxes existed.
 *
 * @see \App\Services\Inventory\StockPermissions for how the ticks are read,
 *      including a store's managers reaching its shelf, floor and Remote Hub.
 */
class FacilityManager extends Model
{
    use HasFactory;

    /** Assign or remove items on a shelf (or Remote Hub lines); set max, refill line, crit low. */
    public const EDIT_PLANOGRAM = 'edit_planogram';

    /** Choose where an item is refilled from: floor, Remote Hub, shipment. */
    public const SET_REFILL_ROUTES = 'set_refill_routes';

    /** Move a refill suggestion onto the Remote Hub → Store list. */
    public const ADD_TO_REMOTE_LIST = 'add_to_remote_list';

    /** Move a refill suggestion onto a shipment manifest. */
    public const ADD_TO_MANIFEST = 'add_to_manifest';

    /** Change a refill request's amount, or cancel it. */
    public const ADJUST_CANCEL_REQUESTS = 'adjust_cancel_requests';

    /** Accept a refill at the Remote Hub, sending it to Delivery. */
    public const ACCEPT_AT_REMOTE = 'accept_at_remote';

    /** Carry floor → shelf transfers across. */
    public const SHELVE = 'shelve';

    /** Every tick box, in the order the screens list them. All on for a new assignment. */
    public const ABILITIES = [
        self::EDIT_PLANOGRAM,
        self::SET_REFILL_ROUTES,
        self::ADD_TO_REMOTE_LIST,
        self::ADD_TO_MANIFEST,
        self::ADJUST_CANCEL_REQUESTS,
        self::ACCEPT_AT_REMOTE,
        self::SHELVE,
    ];

    protected $table = 'facility_managers';

    protected $fillable = [
        'facility_type',
        'facility_id',
        'user_id',
        'is_primary',
        'abilities',
        'assigned_by',
    ];

    protected $casts = [
        'facility_id' => 'integer',
        'user_id' => 'integer',
        'is_primary' => 'boolean',
        'abilities' => 'array',
    ];

    /** Is this tick on for this assignment? NULL abilities = every tick. */
    public function allows(string $ability): bool
    {
        return $this->abilities === null || in_array($ability, $this->abilities, true);
    }

    /** @return array<int, string> the ticks that are on */
    public function grantedAbilities(): array
    {
        return $this->abilities === null ? self::ABILITIES : array_values(array_intersect(self::ABILITIES, $this->abilities));
    }

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
