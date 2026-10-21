<?php

declare(strict_types=1);

namespace Database\Factories\Procurement;

use App\Models\Procurement\Shop;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Shop>
 */
class ShopFactory extends Factory
{
    protected $model = Shop::class;

    public function definition(): array
    {
        return [
            'name' => $this->faker->company(),
            'area' => $this->faker->randomElement(['Merkato', 'Piassa', 'Bole', 'Megenagna']),
            'is_active' => true,
        ];
    }
}
