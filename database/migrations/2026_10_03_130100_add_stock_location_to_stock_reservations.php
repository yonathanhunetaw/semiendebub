<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A reservation may hold at one leaf instead of at a store.
 *
 *   stock_location_id NULL   held against the store's shelf + floor (the norm)
 *   stock_location_id set    held at that leaf — a hub serving a line the
 *                            store cannot, which the buyer agreed to wait for
 *
 * Keeps checkout's delayed-delivery promise honest: it used to rest on stock
 * that existed only in inventory_movements; now it holds real hub stock, so
 * two delayed orders cannot both be promised the same hub carton.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Guarded so a run interrupted after MySQL's (non-transactional) DDL
        // can simply be re-run.
        if (! Schema::hasColumn('stock_reservations', 'stock_location_id')) {
            Schema::table('stock_reservations', function (Blueprint $table): void {
                $table->foreignId('stock_location_id')->nullable()->after('store_id');
            });
        }

        Schema::table('stock_reservations', function (Blueprint $table): void {
            $table->foreign('stock_location_id', 'stock_reservations_location_fk')
                ->references('id')->on('stock_locations')->nullOnDelete();
            // Explicit name: the generated one is over MySQL's 64-character limit.
            $table->index(['item_variant_id', 'stock_location_id', 'status'], 'stock_reservations_leaf_hold_index');
        });
    }

    public function down(): void
    {
        Schema::table('stock_reservations', function (Blueprint $table): void {
            $table->dropForeign('stock_reservations_location_fk');
            $table->dropIndex('stock_reservations_leaf_hold_index');
            $table->dropColumn('stock_location_id');
        });
    }
};
