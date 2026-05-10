<?php

namespace Database\Factories\Item;

use App\Models\Item\ItemCategory;
use Illuminate\Database\Eloquent\Factories\Factory;

class ItemCategoryFactory extends Factory
{
    protected $model = ItemCategory::class;

    public function definition(): array
    {
        return [
            // Using a unique word to avoid collisions in tests
            'category_name' => $this->faker->unique()->word() . ' Category',
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
