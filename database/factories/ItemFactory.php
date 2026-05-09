<?php

namespace Database\Factories;

use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use Illuminate\Database\Eloquent\Factories\Factory;

class ItemFactory extends Factory
{
    protected $model = Item::class;

    public function definition(): array
    {
        return [
            // Correct column names matching Item::$fillable and your migration
            'product_name'        => $this->faker->words(3, true),
            'product_description' => $this->faker->paragraph(),
            'packaging_details'   => $this->faker->sentence(),
            'general_images'      => json_encode(["https://via.placeholder.com/150"]), // was 'product_images'
            'status'              => 'active',
            'is_incomplete'       => false,    // was 'incomplete'
            'item_category_id'    => ItemCategory::firstOrCreate(
                ['category_name' => 'General']
            )->id,

            // REMOVED: 'price', 'sku' — these don't exist on the items table.
            // Price lives on store_variants; SKU lives on item_variants.
        ];
    }
}
