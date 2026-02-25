<?php

namespace Database\Seeders\Sales;

use App\Models\Sales\OrderItem;
use Illuminate\Database\Seeder;

class OrderItemSeeder extends Seeder
{
    public function run()
    {
        OrderItem::factory(10)->create();
    }
}
