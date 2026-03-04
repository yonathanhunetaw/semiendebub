<?php

namespace Database\Seeders\Admin;

use App\Models\Items\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run()
    {
        Product::factory(10)->create();
    }
}
