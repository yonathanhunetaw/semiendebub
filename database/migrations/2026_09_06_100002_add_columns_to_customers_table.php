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
        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'name')) {
                $table->string('name')->nullable()->after('id');
            }
            if (!Schema::hasColumn('customers', 'phone')) {
                $table->string('phone', 30)->nullable()->after('name');
            }
        });

        // Backfill name and phone from existing first_name, last_name, phone_number
        if (Schema::hasColumn('customers', 'first_name') && Schema::hasColumn('customers', 'name')) {
            $concatExpr = DB::getDriverName() === 'sqlite'
                ? "TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))"
                : "TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')))";

            DB::table('customers')
                ->whereNull('name')
                ->orWhere('name', '')
                ->update([
                    'name' => DB::raw($concatExpr)
                ]);
        }

        if (Schema::hasColumn('customers', 'phone_number') && Schema::hasColumn('customers', 'phone')) {
            DB::table('customers')
                ->whereNull('phone')
                ->update([
                    'phone' => DB::raw('phone_number')
                ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (Schema::hasColumn('customers', 'name')) {
                $table->dropColumn('name');
            }
            if (Schema::hasColumn('customers', 'phone')) {
                $table->dropColumn('phone');
            }
        });
    }
};
