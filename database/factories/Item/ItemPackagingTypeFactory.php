<?php

namespace Database\Factories\Item;

use App\Models\Item\ItemPackagingType;
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
