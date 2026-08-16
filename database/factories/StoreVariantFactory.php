<?php
namespace Database\Factories;

use App\Models\Store\StoreVariant;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Factories\Factory;

class StoreVariantFactory extends Factory
{
    protected $model = StoreVariant::class;

    public function definition(): array
    {
        return [
            'store_id'        => Store::factory(),
            'item_variant_id' => ItemVariant::factory(),
            'pricing_matrix'  => [
                'price'            => $this->faker->randomFloat(2, 50, 500),
                'discount_price'   => null,
                'discount_ends_at' => null,
            ],
            'stock'           => $this->faker->numberBetween(0, 500),
            'active'          => true,
            'manual_status'   => 'auto',
        ];
    }
}
