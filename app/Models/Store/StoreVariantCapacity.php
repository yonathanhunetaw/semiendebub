<?php

declare(strict_types=1);

namespace App\Models\Store;

use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * How much of one variant a given place should hold.
 *
 * `min_capacity` is the reorder floor: touch it and the replenishment planner
 * raises a proposal. `max_capacity` is what that proposal tops the location
 * back up to, so the two numbers together describe a band, not a target.
 *
 * The location is the same morph `item_stocks` uses, so every level of the
 * hierarchy can carry its own band for the same variant:
 *
 *   ItemInventoryLocation  a shelf or a back room
 *   Warehouse              a store's remote warehouse
 *   Store                  a whole facility — retail, remote or main warehouse
 */
class StoreVariantCapacity extends Model
{
    use HasFactory;

    protected $table = 'store_variant_capacities';

    protected $fillable = [
        'store_variant_id',
        'item_variant_id',
        'location_type',
        'location_id',
        'min_capacity',
        'max_capacity',
        'set_by',
    ];

    protected $casts = [
        'store_variant_id' => 'integer',
        'item_variant_id' => 'integer',
        'location_id' => 'integer',
        'min_capacity' => 'integer',
        'max_capacity' => 'integer',
    ];

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function storeVariant(): BelongsTo
    {
        return $this->belongsTo(StoreVariant::class, 'store_variant_id');
    }

    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }

    public function location(): MorphTo
    {
        return $this->morphTo();
    }

    public function setter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'set_by');
    }

    /*
    |--------------------------------------------------------------------------
    | Scopes
    |--------------------------------------------------------------------------
    */

    /**
     * Bands the planner acts on.
     *
     * A row with a zero floor records an intent ("never auto-replenish this
     * here") and must not be swept: every location sits at or above zero, so
     * sweeping it would propose a transfer for everything, for ever.
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeMonitored(Builder $query): Builder
    {
        return $query->where('min_capacity', '>', 0)
            ->whereColumn('max_capacity', '>=', 'min_capacity');
    }

    /**
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeAtLocation(Builder $query, string $locationType, int $locationId): Builder
    {
        return $query->where('location_type', $locationType)
            ->where('location_id', $locationId);
    }

    /*
    |--------------------------------------------------------------------------
    | Behaviour
    |--------------------------------------------------------------------------
    */

    /** Has the given on-hand figure reached the floor? */
    public function isBreachedBy(int $onHand): bool
    {
        return $this->min_capacity > 0 && $onHand <= $this->min_capacity;
    }

    /** Units needed to bring the given on-hand figure up to the ceiling. */
    public function shortfallFrom(int $onHand): int
    {
        return max(0, $this->max_capacity - $onHand);
    }
}
