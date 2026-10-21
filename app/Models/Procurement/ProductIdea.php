<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An item someone thinks the business should sell, before it is an item.
 * Status moves only through App\Services\Procurement\ProductIdeaService.
 *
 *   suggested → scouting → scouted → sourcing → approved → bought
 *        (any step before approved) → rejected
 */
class ProductIdea extends Model
{
    use HasFactory;

    public const SUGGESTED = 'suggested';

    public const SCOUTING = 'scouting';

    public const SCOUTED = 'scouted';

    public const SOURCING = 'sourcing';

    public const APPROVED = 'approved';

    public const REJECTED = 'rejected';

    public const BOUGHT = 'bought';

    public const STATUSES = [self::SUGGESTED, self::SCOUTING, self::SCOUTED, self::SOURCING, self::APPROVED, self::REJECTED, self::BOUGHT];

    /** Still moving: not rejected or bought. */
    public const OPEN = [self::SUGGESTED, self::SCOUTING, self::SCOUTED, self::SOURCING, self::APPROVED];

    public const SOURCE_STORE = 'store';

    public const SOURCE_PROCUREMENT = 'procurement';

    protected $fillable = [
        'store_id',
        'suggested_by',
        'source',
        'name',
        'spec',
        'reason',
        'target_price',
        'status',
        'status_changed_by',
        'status_changed_at',
        'item_id',
        'purchase_line_id',
    ];

    protected $casts = [
        'target_price' => 'decimal:2',
        'status_changed_at' => 'datetime',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function suggester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'suggested_by');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(ProductIdeaEvent::class)->orderBy('id');
    }

    public function priceChecks(): HasMany
    {
        return $this->hasMany(PriceCheck::class);
    }

    public function quotes(): HasMany
    {
        return $this->hasMany(SupplierQuote::class);
    }
}
