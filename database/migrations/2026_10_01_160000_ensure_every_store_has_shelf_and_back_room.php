<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Gives every store the two sub-locations the admin stock tool offers.
 *
 * A store's stock is reported at three places, and only now are all three a
 * record of something:
 *
 *   Store Shelf      — item_stocks at an item_inventory_locations row of kind
 *                      `shelf`. What has been put out front.
 *   Store Room       — the store's total at location_type = Store, minus the
 *                      shelf. Derived, never stored, so the two cannot drift.
 *   Remote Warehouse — item_stocks at the Warehouse joined to the store by
 *                      Store::warehouse(). Already real; it was only mislabelled
 *                      "Remote Hub" and sat beside two invented pills,
 *                      "Warehouse A" and "Warehouse B", which no controller has
 *                      ever sent a figure for.
 *
 * The shelf half of that needs a row to hang stock on, and the migration that
 * introduced `kind` only created rows for two stores named in a constant
 * ('Main Store', 'Second Store'). Any other store — Online Store today, and
 * every store created from the admin UI afterwards — had no shelf at all, so
 * the tool fell back to splitting the total 25/75 in the browser.
 *
 * Shelf quantities are not invented here. A new shelf row holds nothing, and
 * Store Room therefore reports the store's whole total until somebody moves
 * stock onto the floor. That is the honest starting state: a figure derived
 * from a percentage was the thing being replaced.
 */
return new class extends Migration
{
    public function up(): void
    {
        // `kind` normally arrives with the migration before this one. Added
        // here too so this runs cleanly on a database that never saw it.
        if (! Schema::hasColumn('item_inventory_locations', 'kind')) {
            Schema::table('item_inventory_locations', function (Blueprint $table): void {
                $table->string('kind')->default('other')->after('name');
            });

            DB::table('item_inventory_locations')->where('name', 'Shop')->update(['kind' => 'shelf']);
            DB::table('item_inventory_locations')->where('name', 'Shop Warehouse')->update(['kind' => 'backroom']);
        }

        $now = now();

        foreach (DB::table('stores')->get(['id']) as $store) {
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
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        /*
         * Only rows this migration could have inserted, and only while they
         * hold nothing. A shelf that has had stock positioned on it is a
         * record of where that stock is; deleting it would orphan the
         * item_stocks rows pointing at it and silently subtract them from the
         * store's shelf figure.
         */
        $empty = DB::table('item_inventory_locations as l')
            ->whereIn('l.name', ['Shop Floor', 'Back Room'])
            ->whereNotExists(function ($query): void {
                $query->select(DB::raw(1))
                    ->from('item_stocks as s')
                    ->whereColumn('s.location_id', 'l.id')
                    ->where('s.location_type', \App\Models\StockKeeper\ItemInventoryLocation::class);
            })
            ->pluck('l.id');

        DB::table('item_inventory_locations')->whereIn('id', $empty)->delete();

        // `kind` is left in place: the migration that introduced it owns that
        // column, and dropping it here would break a rollback to any point
        // between the two.
    }
};
