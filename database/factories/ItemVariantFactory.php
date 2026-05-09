<?php

namespace Database\Factories;

use App\Models\Item\Item;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class ItemVariantFactory extends Factory
{
    protected $model = ItemVariant::class;

    public function definition(): array
    {
        return [
            'item_id'                 => Item::factory(),
            'item_color_id'           => ItemColor::factory(),
            'item_size_id'            => ItemSize::factory(),
            'item_packaging_type_id'  => ItemPackagingType::factory(),
            'owner_id'                => User::factory(),
            'status'                  => 'active',
            'packaging_total_pieces'  => 1,
            'barcode'                 => $this->faker->ean13(),
            'images'                  => [],

            // Leave 'sku' null so the booted() hook auto-generates it after insert.
            // If you set it here, booted() will skip generation (it checks !$variant->sku).
            'sku'                     => null,
        ];
    }
}
