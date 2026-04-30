<?php

namespace Database\Seeders\Admin;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\StoreVariant;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ItemVariantSeeder extends Seeder
{
    public function run(): void
    {
        $items = Item::with(['colors', 'sizes', 'packagingTypes'])->get();
        $storeId = 1;

        foreach ($items as $item) {
            $sizes = $item->sizes->isNotEmpty() ? $item->sizes : [null];

            foreach ($item->colors as $color) {
                foreach ($sizes as $size) {
                    foreach ($item->packagingTypes as $pkg) {

                        $quantityMultiplier = $pkg->pivot->quantity ?? 1;
                        $calculatedPrice = $this->calculateDynamicPrice($item, $color, $size, $pkg);

                        // 2. Create the Physical Variant
                        $variant = ItemVariant::create([
                            'item_id' => $item->id,
                            'item_color_id' => $color->id,
                            'item_size_id' => $size?->id,
                            'item_packaging_type_id' => $pkg->id,
                            'sku' => strtoupper(substr($item->product_name, 0, 3)) . "-" . Str::random(8),
                            'barcode' => (string) rand(1000000000, 9999999999),
                            // 'status' => 'active', // <--- REMOVED THIS LINE
                            'packaging_total_pieces' => $quantityMultiplier,
                            'images' => ["images/products/" . Str::slug($item->product_name) . "/main.jpg"],
                        ]);


                        // 3. Put it in the Store
                        $hasDiscount = rand(1, 10) > 8;

                        StoreVariant::create([
                            'store_id' => $storeId,
                            'item_variant_id' => $variant->id,
                            'price' => $calculatedPrice,
                            'discount_price' => $hasDiscount ? round($calculatedPrice * 0.8, 2) : null,
                            'discount_ends_at' => $hasDiscount ? now()->addDays(7) : null,
                            'stock' => rand(10, 100),
                            'active' => true,
                            'manual_status' => 'auto',
                        ]);
                    }
                }
            }
        }
    }

    /**
     * Logic for generating prices based on item types.
     */
    private function calculateDynamicPrice($item, $color, $size, $pkg): float
    {
        $base = 10.00;

        if (str_contains($item->product_name, 'Bic'))
            $base = 17.00;
        if (str_contains($item->product_name, 'Ring'))
            $base = 15.00;
        if (str_contains($item->product_name, 'Sticky'))
            $base = 10.00;

        $totalQty = $pkg->pivot->quantity ?? 1;

        // Fixed the missing $ below
        $subtotal = $base * $totalQty;

        if ($totalQty > 1) {
            $subtotal = $subtotal * 0.95;
        }

        return round($subtotal, 2);
    }
}
