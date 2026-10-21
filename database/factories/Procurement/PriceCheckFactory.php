<?php

declare(strict_types=1);

namespace Database\Factories\Procurement;

use App\Models\Procurement\PriceCheck;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PriceCheck>
 */
class PriceCheckFactory extends Factory
{
    protected $model = PriceCheck::class;

    public function definition(): array
    {
        return [
            'store_id' => Store::factory(),
            'shops_wanted' => 3,
            'status' => PriceCheck::OPEN,
        ];
    }
}
