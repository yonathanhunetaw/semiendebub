<?php

namespace Database\Seeders\Admin;

use App\Models\Item\Item;
use Illuminate\Database\Seeder;

class ItemSeeder extends Seeder
{
    public function run(): void
    {
        $items = [
            [
                'name' => 'Noteit Sticky Note',
                'description' => 'NoteIt / Sticky Notes is a simple and convenient tool...',
                'category_id' => 43,
                'subcategory_id' => 45,
                'color_ids' => [1, 2, 3, 4, 11],
                'size_ids' => [1, 2, 3],
                'packagings' => [
                    1 => ['quantity' => 1],
                    2 => ['quantity' => 12],
                    3 => ['quantity' => 18],
                ],
                'active_packaging' => [1, 2],
                'price_rules' => [
                    'base_price' => 10,
                    'size_increase' => 10,
                    'packaging_discount' => [1 => 0, 2 => 5, 3 => 12],
                ],
            ],
            [
                'name' => 'Ring',
                'description' => 'Binding rings for punched papers...',
                'category_id' => 21,
                'subcategory_id' => 28,
                'color_ids' => [1, 2, 3, 4, 5],
                'size_ids' => [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34],
                'packagings' => [
                    2 => ['quantity' => 50],
                    3 => ['quantity' => 18],
                ],
                'active_packaging' => [2],
                'price_rules' => [
                    'base_price' => 15,
                    'size_increase' => 10,
                    'packaging_discount' => [2 => 0, 3 => 10],
                ],
            ],
            [
                'name' => 'Bic Pen',
                'description' => 'Classic Bic pens...',
                'category_id' => 11,
                'subcategory_id' => 12,
                'color_ids' => [2, 5, 1],
                'size_ids' => [],
                'packagings' => [
                    1 => ['quantity' => 1],
                    2 => ['quantity' => 50],
                    3 => ['quantity' => 20],
                ],
                'active_packaging' => [1, 2],
                'price_rules' => [
                    'base_price' => 17,
                    'size_increase' => 0,
                    'packaging_discount' => [1 => 0, 2 => 8, 3 => 10],
                    'color_discount' => [1 => 0, 2 => 12, 5 => 6],
                ],
            ],
        ];

        foreach ($items as $data) {
            $item = Item::create([
                'product_name'        => $data['name'],
                'product_description' => $data['description'],
                'general_images'      => ["images/product_images/" . str_replace(' ', '_', $data['name']) . "_1.jpg"],
                'status'              => 'active',
                'item_category_id'    => $data['subcategory_id'] ?? $data['category_id'],
                'is_incomplete'       => false,
            ]);

            // Sync relationships
            $item->colors()->sync($data['color_ids']);
            $item->sizes()->sync($data['size_ids']);
            $item->packagingTypes()->sync($data['packagings']);

            // Note: We store price_rules and active_packaging as a "memory" for the next seeder
            // by using the $data array directly in the next step.
        }
    }
}
