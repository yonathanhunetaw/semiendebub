<?php
namespace Database\Factories;

use App\Models\Store\StoreVariant;
use App\Models\Item\ItemVariant;
use Illuminate\Database\Eloquent\Factories\Factory;

class StoreVariantFactory extends Factory
{
    protected $model = StoreVariant::class;

    public function definition(): array
    {
        return [
            'store_id' => 1,
            'item_variant_id' => ItemVariant::factory(),
            'price' => $this->faker->randomFloat(2, 100, 1000),
            'stock' => $this->faker->numberBetween(0, 500),
            'active' => true,
        ];
    }
}
