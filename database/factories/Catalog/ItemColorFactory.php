<?php

namespace Database\Factories\Catalog;

use App\Models\Catalog\ItemColor;
use Illuminate\Database\Eloquent\Factories\Factory;

class ItemColorFactory extends Factory
{
    protected $model = ItemColor::class;

    public function definition(): array
    {
        return [
            'name' => fake()->safeColorName(),
            'item_id' => fake()->numberBetween(1, 10), // Assuming you have 10 items
        ];
    }
}
