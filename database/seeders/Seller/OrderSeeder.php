<?php

namespace Database\Seeders\Seller;

use App\Models\Seller\Order;
use Illuminate\Database\Seeder;

class OrderSeeder extends Seeder
{
    public function run()
    {
        Order::factory()->count(10)->create();
    }
}
