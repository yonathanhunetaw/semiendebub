<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('store_variants', function (Blueprint $table) {
            if (!Schema::hasColumn('store_variants', 'item_id')) {
                $table->foreignId('item_id')
                    ->nullable()
                    ->after('id')
                    ->constrained('items')
                    ->cascadeOnDelete();
            }
        });

        // Backfill item_id from item_variants
        if (Schema::hasColumn('store_variants', 'item_id') && Schema::hasColumn('store_variants', 'item_variant_id')) {
            DB::statement("
                UPDATE store_variants
                SET item_id = (
                    SELECT item_variants.item_id
                    FROM item_variants
                    WHERE item_variants.id = store_variants.item_variant_id
                )
                WHERE item_id IS NULL
            ");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('store_variants', function (Blueprint $table) {
            if (Schema::hasColumn('store_variants', 'item_id')) {
                $table->dropConstrainedForeignId('item_id');
            }
        });
    }
};
