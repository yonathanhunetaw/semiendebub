<?php

namespace Database\Seeders\Sales;

use App\Models\Sales\Order;
use Illuminate\Database\Seeder;

class OrderSeeder extends Seeder
{
    public function run()
    {
        Order::factory()->count(10)->create();
    }
}
