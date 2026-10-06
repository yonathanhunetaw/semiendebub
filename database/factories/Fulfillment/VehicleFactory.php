<?php

declare(strict_types=1);

namespace Database\Factories\Fulfillment;

use App\Models\Fulfillment\Vehicle;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Vehicle> */
class VehicleFactory extends Factory
{
    protected $model = Vehicle::class;

    public function definition(): array
    {
        return [
            'name' => $this->faker->randomElement(['Isuzu NPR', 'Isuzu FSR', 'Toyota Dyna', 'Hino 300']),
            'plate' => 'AA-'.$this->faker->unique()->numerify('3-#####'),
            'max_cbm' => $this->faker->randomElement([12, 18, 24, 32]),
            'payload_kg' => $this->faker->randomElement([3000, 5000, 8000]),
            'status' => Vehicle::STATUS_ACTIVE,
        ];
    }
}
