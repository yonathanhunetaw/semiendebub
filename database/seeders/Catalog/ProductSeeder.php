<?php

namespace Database\Seeders\Catalog;

use App\Models\Items\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run()
    {
        Product::factory(10)->create();
    }
}
