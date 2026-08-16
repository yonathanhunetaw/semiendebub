<?php
namespace Database\Factories\Store;

use App\Models\Store\StoreVariant;
use Illuminate\Database\Eloquent\Factories\Factory;

class StoreVariantFactory extends Factory
{
    protected $model = StoreVariant::class;

    public function definition(): array
    {
        return [
            'store_id'        => \App\Models\Store\Store::factory(),
            'item_variant_id' => \App\Models\Item\ItemVariant::factory(),
            'pricing_matrix'  => [
                'price'            => $this->faker->randomFloat(2, 10, 1000),
                'discount_price'   => null,
                'discount_ends_at' => null,
            ],
            'stock'        => $this->faker->numberBetween(0, 100),
            'active'       => true,
            'manual_status' => 'auto',
        ];
    }
}
