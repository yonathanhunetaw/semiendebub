<?php

declare(strict_types=1);

namespace App\Models\Inventory;

use App\Models\Item\Item;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The ordered sources a store's shelf may be refilled from, for one item.
 * See App\Services\Inventory\RefillEngine.
 *
 * @property int $store_id
 * @property int $item_id
 * @property array<int, string> $sources
 */
class ItemRefillRoute extends Model
{
    public const SOURCE_FLOOR = 'floor';

    public const SOURCE_REMOTE_HUB = 'remote_hub';

    public const SOURCE_SHIPMENT = 'shipment';

    public const SOURCES = [self::SOURCE_FLOOR, self::SOURCE_REMOTE_HUB, self::SOURCE_SHIPMENT];

    /** Used when a store has not set a route for the item. */
    public const DEFAULT_SOURCES = self::SOURCES;

    protected $fillable = [
        'store_id',
        'item_id',
        'sources',
        'updated_by',
    ];

    protected $casts = [
        'store_id' => 'integer',
        'item_id' => 'integer',
        'sources' => 'array',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
