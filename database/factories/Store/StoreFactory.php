<?php
namespace Database\Factories\Store;

use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Factories\Factory;

class StoreFactory extends Factory
{
    protected $model = Store::class;

    public function definition(): array
    {
        return [
            'name' => $this->faker->company,
            // add any other required store fields here
        ];
    }
}
