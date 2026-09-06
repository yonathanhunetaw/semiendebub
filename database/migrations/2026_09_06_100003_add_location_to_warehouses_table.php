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
        Schema::table('warehouses', function (Blueprint $table) {
            if (!Schema::hasColumn('warehouses', 'location')) {
                $table->string('location')->nullable()->after('name');
            }
        });

        // Backfill from address if present
        if (Schema::hasColumn('warehouses', 'address') && Schema::hasColumn('warehouses', 'location')) {
            DB::table('warehouses')
                ->whereNull('location')
                ->update([
                    'location' => DB::raw('address')
                ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('warehouses', function (Blueprint $table) {
            if (Schema::hasColumn('warehouses', 'location')) {
                $table->dropColumn('location');
            }
        });
    }
};
