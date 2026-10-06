<?php

declare(strict_types=1);

namespace App\Models\Fulfillment;

use Database\Factories\Fulfillment\VehicleFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One car in the fleet. A shipment's creator picks one to carry the run.
 *
 * @property int $id
 * @property string $name
 * @property string $plate
 * @property string $max_cbm
 * @property int $payload_kg
 * @property string $status
 */
class Vehicle extends Model
{
    use HasFactory;

    public const STATUS_ACTIVE = 'active';

    public const STATUS_INACTIVE = 'inactive';

    protected $fillable = [
        'name',
        'plate',
        'max_cbm',
        'payload_kg',
        'status',
        'notes',
    ];

    protected $casts = [
        'max_cbm' => 'decimal:2',
        'payload_kg' => 'integer',
    ];

    protected static function newFactory(): VehicleFactory
    {
        return VehicleFactory::new();
    }

    public function shipments(): HasMany
    {
        return $this->hasMany(Shipment::class);
    }

    /** @param Builder<Vehicle> $query */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_ACTIVE);
    }
}
