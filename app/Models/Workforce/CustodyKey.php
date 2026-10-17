<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * The one key of a site (a StockLocation node) or of a vehicle, and who holds
 * it now. There are no copies. Only App\Services\Workforce\KeyCustodyService
 * changes the holder.
 *
 * @property int $id
 * @property string $keyable_type
 * @property int $keyable_id
 * @property int|null $holder_id
 */
class CustodyKey extends Model
{
    protected $fillable = ['keyable_type', 'keyable_id', 'holder_id', 'held_since'];

    protected $casts = [
        'keyable_id' => 'integer',
        'holder_id' => 'integer',
        'held_since' => 'datetime',
    ];

    public function keyable(): MorphTo
    {
        return $this->morphTo();
    }

    public function holder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'holder_id');
    }

    public function handovers(): HasMany
    {
        return $this->hasMany(KeyHandover::class)->latest('id');
    }

    /** The hand-over waiting on its receiver, if any (at most one at a time). */
    public function pendingHandover(): ?KeyHandover
    {
        return $this->handovers()->where('status', KeyHandover::STATUS_CLAIMED)->first();
    }

    public function isVehicleKey(): bool
    {
        return $this->keyable_type === Vehicle::class;
    }

    public function isSiteKey(): bool
    {
        return $this->keyable_type === StockLocation::class;
    }

    /** "Store 1 key", "Toyota Hilux (AA-1234) key". */
    public function label(): string
    {
        $keyable = $this->keyable;

        return match (true) {
            $keyable instanceof Vehicle => sprintf('%s (%s) key', $keyable->name, $keyable->plate),
            $keyable instanceof StockLocation => $keyable->name.' key',
            default => 'Key',
        };
    }
}
