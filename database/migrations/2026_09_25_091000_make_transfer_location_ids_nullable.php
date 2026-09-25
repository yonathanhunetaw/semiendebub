<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `transfers` carries two location vocabularies: from/to_store_id (nullable)
 * and from/to_location_id (NOT NULL, pointing at item_inventory_locations).
 *
 * The stock ledger (`item_stocks`) records store- and warehouse-held units, not
 * item_inventory_locations, so a store-to-store transfer has no meaningful
 * location id to supply. Relaxing these two columns lets a transfer be
 * expressed at store granularity instead of inventing a location.
 *
 * Existing writers that do supply location ids are unaffected — this only
 * permits null, it does not change any stored value.
 *
 * Uses the schema builder rather than raw SQL so it runs on SQLite too: the
 * test suite builds its database in memory on that driver.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transfers', function (Blueprint $table): void {
            $table->unsignedBigInteger('from_location_id')->nullable()->change();
            $table->unsignedBigInteger('to_location_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Rows created at store granularity carry no location, so they are
        // backfilled to the first inventory location before the column is
        // tightened again; otherwise the change would fail.
        $fallback = DB::table('item_inventory_locations')->orderBy('id')->value('id');

        if ($fallback !== null) {
            DB::table('transfers')->whereNull('from_location_id')->update(['from_location_id' => $fallback]);
            DB::table('transfers')->whereNull('to_location_id')->update(['to_location_id' => $fallback]);
        }

        Schema::table('transfers', function (Blueprint $table): void {
            $table->unsignedBigInteger('from_location_id')->nullable(false)->change();
            $table->unsignedBigInteger('to_location_id')->nullable(false)->change();
        });
    }
};
