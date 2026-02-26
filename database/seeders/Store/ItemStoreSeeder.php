<?php

namespace Database\Seeders\Store;

use App\Models\Items\Item;
use App\Models\Store\Store;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ItemStoreSeeder extends Seeder
{
    public function run(): void
    {
        $now = Carbon::now();

        $stores = Store::all();
        $items = Item::all();

        foreach ($stores as $store) {
            foreach ($items as $item) {
                DB::table('item_store')->updateOrInsert(
                    [
                        'store_id' => $store->id,
                        'item_id' => $item->id,
                    ],
                    [
                        'active' => true,        // all items active
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]
                );
            }
        }
    }
}
