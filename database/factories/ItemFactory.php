<?php
namespace Database\Factories;

use App\Models\Item\Item;
use Illuminate\Database\Eloquent\Factories\Factory;

class ItemFactory extends Factory
{
    protected $model = Item::class;

    public function definition(): array
    {
        return [
            'product_name' => $this->faker->words(3, true),
            'product_description' => $this->faker->paragraph(),
            'packaging_details' => $this->faker->sentence(),
            'price' => $this->faker->randomFloat(2, 10, 1000),
            'status' => 'active',
            'incomplete' => false,
            'category_id' => 1,
            'sku' => $this->faker->unique()->word(),
            'product_images' => json_encode(["https://via.placeholder.com/150"]),
            // REMOVE 'variation' => $this->faker->word(),
        ];
    }
}
