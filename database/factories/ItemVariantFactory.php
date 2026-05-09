<?php

namespace Database\Factories;

use App\Models\Item\ItemVariant;
use Illuminate\Database\Eloquent\Factories\Factory;

class ItemVariantFactory extends Factory
{
    protected $model = ItemVariant::class;

    public function definition(): array
    {
        return [
            'item_id' => \App\Models\Item\Item::factory(), // Or create an Item manually
            'sku' => $this->faker->unique()->word(),
            'status' => 'active',
            // ... add other required fields
        ];
    }
}
