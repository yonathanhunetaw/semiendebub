<?php

declare(strict_types=1);

use App\Models\Store\Store;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Gives a store's floor and its back room separate, real identities.
 *
 * `item_inventory_locations` already existed as a stock-bearing sub-location —
 * StoreController::storeTransfer() moves stock out of one, and
 * receiveTransfer() decrements one — but nothing distinguished a shelf from a
 * stockroom, only four free-text names all pinned to store 1.
 *
 * Meanwhile the admin stock tool was splitting a store's total 25/75 in the
 * browser (`shelfStock = Math.round(totalStoreStock * 0.25)`), so the shelf and
 * store-room figures on screen were arithmetic, not a record of where anything
 * actually was.
 *
 * The split is now:
 *
 *   store total  — item_stocks at location_type = Store. Unchanged, and still
 *                  what every other reader means by a store's stock.
 *   shelf        — item_stocks at location_type = ItemInventoryLocation, for a
 *                  location of kind `shelf`. What has been put out front.
 *   back room    — store total minus shelf. Derived, never stored, so the two
 *                  cannot drift apart.
 *
 * Shelf quantities start at zero: nothing records what is on the floor today,
 * and inventing a figure is what this replaces.
 */
return new class extends Migration
{
    /** Stores that get a shelf and a back room. */
    private const PHYSICAL_STORE_NAMES = ['Main Store', 'Second Store'];

    public function up(): void
    {
        Schema::table('item_inventory_locations', function (Blueprint $table): void {
            // `other` covers the two "Wesen Warehouse" rows, which duplicate
            // entries in the warehouses table and are not part of a store's
            // own shelf/back-room split.
            $table->string('kind')->default('other')->after('name');
        });

        // Classify the rows that already exist, by the names the seeder gave them.
        DB::table('item_inventory_locations')->where('name', 'Shop')->update(['kind' => 'shelf']);
        DB::table('item_inventory_locations')->where('name', 'Shop Warehouse')->update(['kind' => 'backroom']);

        foreach (self::PHYSICAL_STORE_NAMES as $storeName) {
            $store = DB::table('stores')->where('name', $storeName)->first();

            if (! $store) {
                continue;
            }

            foreach ([['Shop Floor', 'shelf'], ['Back Room', 'backroom']] as [$name, $kind]) {
                $exists = DB::table('item_inventory_locations')
                    ->where('store_id', $store->id)
                    ->where('kind', $kind)
                    ->exists();

                if ($exists) {
                    continue;
                }

                DB::table('item_inventory_locations')->insert([
                    'name' => $name,
                    'kind' => $kind,
                    'store_id' => $store->id,
                    'address' => '',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        DB::table('item_inventory_locations')
            ->whereIn('name', ['Shop Floor', 'Back Room'])
            ->delete();

        Schema::table('item_inventory_locations', function (Blueprint $table): void {
            $table->dropColumn('kind');
        });
    }
};
