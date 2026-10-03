<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * inventory_movements becomes the stock journal (STOCK_PLAN.md phase 3).
 *
 * The ledger of record is item_stocks, booked per item_variant at a
 * stock_location. The journal therefore has to name the same two things; a
 * store_variant (a price listing) cannot say where a unit physically moved.
 *
 *   item_variant_id, stock_location_id  what moved, and where
 *   quantity                            signed: + into the location, − out of it
 *   balance_after                       the row's quantity once this applied
 *   reason, notes                       why, in words
 *   reference_type / reference_id       what caused it (sale item, transfer…)
 *
 * `type` widens from an enum to a string so the gateway's verbs (receive,
 * move_out, move_in, pick, adjust, reserve, release) fit beside the legacy
 * ones. The table holds no rows today, so nothing is converted. The journal is
 * an audit trail only: availability is never computed from it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_movements', function (Blueprint $table): void {
            $table->foreignId('store_variant_id')->nullable()->change();
            $table->string('type', 32)->change();

            $table->foreignId('item_variant_id')->nullable()->after('store_variant_id')
                ->constrained('item_variants')->cascadeOnDelete();
            $table->foreignId('stock_location_id')->nullable()->after('item_variant_id')
                ->constrained('stock_locations')->nullOnDelete();
            $table->integer('balance_after')->nullable()->after('quantity');
            $table->string('reason')->nullable()->after('type');
            $table->string('reference_type')->nullable()->after('destination_id');
            $table->text('notes')->nullable()->after('user_id');

            $table->index(['item_variant_id', 'stock_location_id', 'created_at'], 'inventory_movements_journal_index');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_movements', function (Blueprint $table): void {
            $table->dropIndex('inventory_movements_journal_index');
            $table->dropForeign(['item_variant_id']);
            $table->dropForeign(['stock_location_id']);
            $table->dropColumn(['item_variant_id', 'stock_location_id', 'balance_after', 'reason', 'reference_type', 'notes']);
        });
    }
};
