<?php

namespace Database\Seeders\Catalog;

use App\Models\Catalog\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run()
    {
        Product::factory(10)->create();
    }
}
