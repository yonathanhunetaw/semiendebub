<?php

namespace Database\Factories\Item;

use App\Models\Item\ItemSize;
use Illuminate\Database\Eloquent\Factories\Factory;

class ItemSizeFactory extends Factory
{
    protected $model = ItemSize::class;

    public function definition(): array
    {
        return [
            'name' => fake()->randomElement(['Small', 'Medium', 'Large', 'XL']),
        ];
    }
}
