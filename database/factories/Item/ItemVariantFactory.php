<?php
namespace Database\Factories\Item;

use App\Models\Item\ItemVariant;
use Illuminate\Database\Eloquent\Factories\Factory;

class ItemVariantFactory extends Factory
{
    protected $model = ItemVariant::class;

    public function definition(): array
    {
        return [
            'item_id' => \App\Models\Item\Item::factory(),
            'sku' => $this->faker->unique()->ean13(),
            // Add other fields like color_id or size_id if required by your DB
        ];
    }
}
