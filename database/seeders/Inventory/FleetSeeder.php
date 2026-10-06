<?php

declare(strict_types=1);

namespace Database\Seeders\Inventory;

use App\Models\Fulfillment\Vehicle;
use Illuminate\Database\Seeder;

/** The cars a shipment's creator can pick on the Fleet step. */
class FleetSeeder extends Seeder
{
    public function run(): void
    {
        foreach ([
            ['name' => 'Isuzu NPR', 'plate' => 'AA-3-48217', 'max_cbm' => 14.5, 'payload_kg' => 4200],
            ['name' => 'Isuzu FSR', 'plate' => 'AA-3-51902', 'max_cbm' => 24, 'payload_kg' => 8000],
            ['name' => 'Toyota Dyna', 'plate' => 'AA-3-60311', 'max_cbm' => 12, 'payload_kg' => 3000],
        ] as $car) {
            Vehicle::query()->updateOrCreate(['plate' => $car['plate']], $car + ['status' => Vehicle::STATUS_ACTIVE]);
        }
    }
}
