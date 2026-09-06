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
        Schema::table('items', function (Blueprint $table) {
            if (!Schema::hasColumn('items', 'description')) {
                $table->text('description')->nullable()->after('product_name');
            }
        });

        // Backfill from product_description if present
        if (Schema::hasColumn('items', 'product_description') && Schema::hasColumn('items', 'description')) {
            DB::table('items')
                ->whereNull('description')
                ->update([
                    'description' => DB::raw('product_description')
                ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            if (Schema::hasColumn('items', 'description')) {
                $table->dropColumn('description');
            }
        });
    }
};
