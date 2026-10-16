<?php

declare(strict_types=1);

namespace Database\Factories\Procurement;

use App\Models\Procurement\Supplier;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Supplier>
 */
class SupplierFactory extends Factory
{
    protected $model = Supplier::class;

    public function definition(): array
    {
        return [
            'name' => $this->faker->company(),
            'country' => $this->faker->randomElement(['China', 'Turkey', 'UAE', 'India']),
            'city' => $this->faker->city(),
            'currency' => 'USD',
            'phone' => $this->faker->phoneNumber(),
            'email' => $this->faker->companyEmail(),
            'contacts' => [],
            'default_payment_terms' => 'immediate',
            'default_payment_days' => null,
            'is_active' => true,
        ];
    }
}
