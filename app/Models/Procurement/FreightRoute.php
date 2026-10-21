<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * What one way of bringing goods in costs per CBM, before any real shipment
 * exists: overseas storage and sea freight in the route's currency, port and
 * clearing, land transport and the last leg to the store in ETB, and
 * insurance as a share of the goods' value. A quote picks a route.
 */
class FreightRoute extends Model
{
    use HasFactory;

    /** The figures a quote may override, and the currency each is in. */
    public const FOREIGN = ['overseas_storage_per_cbm', 'sea_freight_per_cbm'];

    public const LOCAL = ['port_clearing_per_cbm', 'land_transport_per_cbm', 'to_store_per_cbm'];

    public const FIGURES = [...self::FOREIGN, 'insurance_pct', ...self::LOCAL];

    protected $fillable = [
        'name',
        'origin',
        'currency',
        'overseas_storage_per_cbm',
        'sea_freight_per_cbm',
        'insurance_pct',
        'port_clearing_per_cbm',
        'land_transport_per_cbm',
        'to_store_per_cbm',
        'transit_days',
        'notes',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'overseas_storage_per_cbm' => 'decimal:2',
        'sea_freight_per_cbm' => 'decimal:2',
        'insurance_pct' => 'decimal:3',
        'port_clearing_per_cbm' => 'decimal:2',
        'land_transport_per_cbm' => 'decimal:2',
        'to_store_per_cbm' => 'decimal:2',
        'transit_days' => 'integer',
        'is_active' => 'boolean',
    ];
}
