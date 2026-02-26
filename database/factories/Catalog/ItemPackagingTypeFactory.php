<?php

namespace Database\Factories\Catalog;

use App\Models\Items\ItemPackagingType;
use Illuminate\Database\Eloquent\Factories\Factory;

class ItemPackagingTypeFactory extends Factory
{
    protected $model = ItemPackagingType::class;

    public function definition(): array
    {
        return [
            'name' => $this->faker->randomElement(['Box', 'Bag', 'Bottle']),
        ];
    }
}
