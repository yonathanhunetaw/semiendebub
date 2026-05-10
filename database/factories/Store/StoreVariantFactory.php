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
            'store_id' => \App\Models\Store\Store::factory(),
            'item_variant_id' => \App\Models\Item\ItemVariant::factory(),
            'price' => $this->faker->randomFloat(2, 10, 1000),
            'stock' => $this->faker->numberBetween(0, 100),

            // ✅ Match your migration's $table->boolean('active')
            'active' => true,

            // ✅ Match your migration's $table->enum('manual_status', ['auto', 'forced'])
            'manual_status' => 'auto',

            'updated_at' => now(),
            'created_at' => now(),
        ];
    }
}
