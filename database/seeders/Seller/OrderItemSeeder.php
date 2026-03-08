<?php

namespace Database\Seeders\Seller;

use App\Models\Seller\OrderItem;
use Illuminate\Database\Seeder;

class OrderItemSeeder extends Seeder
{
    public function run()
    {
        OrderItem::factory(10)->create();
    }
}
