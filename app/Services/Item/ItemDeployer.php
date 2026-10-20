<?php

declare(strict_types=1);

namespace App\Services\Item;

use App\Models\Item\Item;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;

/**
 * Deploys an item to a store: one store variant per variant that has none there yet.
 *
 * Used by the admin's Deploy button and by the item setup page, so both do the same thing.
 * Idempotent: a store variant that already exists is left as it is (its price, its switch).
 * New ones arrive **switched off and unpriced**: nothing is invented, and nothing can be sold for
 * free. Saving a real price on the item setup page switches the variant on.
 */
final class ItemDeployer
{
    /** @return int how many store variants were created */
    public function deploy(Item $item, Store $store): int
    {
        $item->loadMissing('variants');

        $created = 0;
        foreach ($item->variants as $variant) {
            $created += StoreVariant::query()->insertOrIgnore([
                'item_id' => $item->id,
                'item_variant_id' => $variant->id,
                'store_id' => $store->id,
                'stock' => 0,
                'pricing_matrix' => json_encode([
                    'price' => null,
                    'discount_price' => null,
                    'discount_ends_at' => null,
                ]),
                'active' => false,
                'manual_status' => 'auto',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return $created;
    }
}
