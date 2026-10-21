<?php

declare(strict_types=1);

namespace Database\Factories\Procurement;

use App\Models\Procurement\ProductIdea;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ProductIdea>
 */
class ProductIdeaFactory extends Factory
{
    protected $model = ProductIdea::class;

    public function definition(): array
    {
        return [
            'store_id' => null,
            'suggested_by' => null,
            'source' => ProductIdea::SOURCE_STORE,
            'name' => $this->faker->randomElement(['SanDisk 64 GB flash drive', 'USB-C cable 1 m', 'A4 paper ream', 'Wireless mouse']),
            'spec' => null,
            'reason' => null,
            'target_price' => null,
            'status' => ProductIdea::SUGGESTED,
        ];
    }
}
