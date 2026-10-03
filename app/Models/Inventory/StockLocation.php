<?php

declare(strict_types=1);

namespace App\Models\Inventory;

use App\Models\Concerns\HasFacilityManagers;
use App\Models\Store\Store;
use Database\Factories\Inventory\StockLocationFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A node in the one location tree (STOCK_PLAN.md §2.1).
 *
 * Every place stock can sit is a row here. Stock is only ever booked against a
 * stockable leaf — a shelf, the store floor, a remote hub or a main hub. A `store`
 * node groups one retail store's leaves and holds nothing itself; its figure is
 * the sum of its children.
 *
 * @property int $id
 * @property int|null $parent_id
 * @property string $kind
 * @property string $name
 * @property string $code
 * @property int|null $store_id
 * @property bool $is_stockable
 */
class StockLocation extends Model
{
    use HasFactory;

    /**
     * One or two named managers per location — a shelf, a store floor, a
     * Remote Hub, Hub A, Hub B. Stored in facility_managers with this class as
     * the facility type. When a location has managers, only they (and admins)
     * hand stock out of it or take it in.
     */
    use HasFacilityManagers;

    /** Group node for one retail store. Never holds stock. */
    public const KIND_STORE = 'store';

    /** What customers can reach. Spoken in the smallest unit. */
    public const KIND_SHELF = 'shelf';

    /**
     * The store floor, labelled "Store". There is no separate store room:
     * stock in a store is either on the shelf or on the floor. The key keeps
     * the legacy item_inventory_locations name so the two map 1:1.
     */
    public const KIND_BACKROOM = 'backroom';

    /** A store's optional overflow site — at most one per store. */
    public const KIND_REMOTE_HUB = 'remote_hub';

    /** A distribution hub shared by every store. */
    public const KIND_MAIN_HUB = 'main_hub';

    /**
     * Goods in a courier's hands: handed over by one location, not yet handed
     * to the next. Holds ledger rows so custody is conserved at every step,
     * but is never sellable and belongs to no store.
     */
    public const KIND_TRANSIT = 'transit';

    /** The one custody location's code. */
    public const TRANSIT_CODE = 'IN-DELIVERY';

    /** Kinds that may carry item_stocks rows. */
    public const STOCKABLE_KINDS = [
        self::KIND_SHELF,
        self::KIND_BACKROOM,
        self::KIND_REMOTE_HUB,
        self::KIND_MAIN_HUB,
    ];

    /** @return array<string, string> kind => label, in ladder order (closest to the customer first) */
    public static function kindLabels(): array
    {
        return [
            self::KIND_SHELF => 'Store Shelf',
            self::KIND_BACKROOM => 'Store',
            self::KIND_REMOTE_HUB => 'Remote Hub',
            self::KIND_MAIN_HUB => 'Main Hub',
            self::KIND_TRANSIT => 'In Delivery',
            self::KIND_STORE => 'Retail Store',
        ];
    }

    public static function isStockableKind(string $kind): bool
    {
        return in_array($kind, self::STOCKABLE_KINDS, true);
    }

    protected $fillable = [
        'parent_id',
        'kind',
        'name',
        'code',
        'address',
        'status',
        'store_id',
        'is_stockable',
        'legacy_type',
        'legacy_id',
    ];

    protected $casts = [
        'parent_id' => 'integer',
        'store_id' => 'integer',
        'is_stockable' => 'boolean',
        'legacy_id' => 'integer',
    ];

    protected static function newFactory(): StockLocationFactory
    {
        return StockLocationFactory::new();
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    /** Ledger rows booked here. Only ever non-empty on a stockable leaf. */
    public function stocks(): HasMany
    {
        return $this->hasMany(ItemStock::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function isTransit(): bool
    {
        return $this->kind === self::KIND_TRANSIT;
    }

    public function isMainHub(): bool
    {
        return $this->kind === self::KIND_MAIN_HUB;
    }

    /**
     * The physical site a leaf is at. A store's shelf and floor are one site,
     * so moving between them needs no courier; every other leaf is its own.
     */
    public function siteKey(): string
    {
        return in_array($this->kind, [self::KIND_SHELF, self::KIND_BACKROOM], true) && $this->store_id !== null
            ? 'store#'.$this->store_id
            : 'location#'.$this->id;
    }

    public function sameSiteAs(self $other): bool
    {
        return $this->siteKey() === $other->siteKey();
    }

    /**
     * May this user hand stock out of, or take stock into, this location?
     * Admins always; otherwise its managers when it has any. A location with
     * no managers yet falls back to the role checks the routes already make.
     */
    public function canBeOperatedBy(?\App\Models\Auth\User $user): bool
    {
        if ($user === null) {
            return false;
        }

        if (in_array($user->roleKey(), ['admin', 'dev'], true)) {
            return true;
        }

        return ! $this->managerAssignments()->exists() || $this->isManagedBy($user);
    }

    public function getKindLabelAttribute(): string
    {
        return self::kindLabels()[$this->kind] ?? 'Location';
    }

    /** @param  Builder<self>  $query */
    public function scopeStockable(Builder $query): Builder
    {
        return $query->where('is_stockable', true);
    }

    /** @param  Builder<self>  $query */
    public function scopeOfKind(Builder $query, string ...$kinds): Builder
    {
        return $query->whereIn('kind', $kinds);
    }

    /** @param  Builder<self>  $query */
    public function scopeLegacy(Builder $query, string $type, int $id): Builder
    {
        return $query->where('legacy_type', $type)->where('legacy_id', $id);
    }
}
