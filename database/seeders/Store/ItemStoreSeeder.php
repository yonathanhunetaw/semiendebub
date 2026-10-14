<?php

namespace Database\Seeders\Store;

use App\Models\Item\Item;
use App\Models\Store\Store;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Lists the whole catalogue in the Main Store and the Online Store (which the
 * public storefront sells from). Second Store carries nothing, so
 * StoreVariantSeeder deploys and prices nothing there.
 */
class ItemStoreSeeder extends Seeder
{
    public function run(): void
    {
        $now = Carbon::now();

        $stores = Store::query()->whereIn('name', ['Main Store', 'Online Store'])->get();
        $items = Item::all();

        foreach ($stores as $store) {
            // Only items not yet linked to this store; existing links (and their active flag) are untouched.
            $linked = DB::table('item_store')->where('store_id', $store->id)->pluck('item_id')->flip()->all();

            foreach ($items as $item) {
                if (isset($linked[$item->id])) {
                    continue;
                }

                DB::table('item_store')->insert([
                    'store_id' => $store->id,
                    'item_id' => $item->id,
                    'active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }
}
