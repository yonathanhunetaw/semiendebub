<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * A driver for each site day, next to its opener and closer: they bring the
 * opener in before opening and take the closer home after closing. Those two
 * staff rides are made from the plan (staff_rides.site_day_id + purpose).
 * Opening or closing without one goes ahead, flagged (site_days.no_driver).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('site_days', function (Blueprint $table) {
            $table->foreignId('driver_id')->nullable()->after('closer_id')->constrained('users')->nullOnDelete();
            $table->boolean('no_driver')->default(false)->after('opened_without_key');
        });

        Schema::table('staff_rides', function (Blueprint $table) {
            $table->foreignId('site_day_id')->nullable()->after('stock_location_id')->constrained('site_days')->nullOnDelete();
            $table->string('purpose', 16)->nullable()->after('site_day_id');
        });
    }

    public function down(): void
    {
        Schema::table('staff_rides', function (Blueprint $table) {
            $table->dropConstrainedForeignId('site_day_id');
            $table->dropColumn('purpose');
        });

        Schema::table('site_days', function (Blueprint $table) {
            $table->dropConstrainedForeignId('driver_id');
            $table->dropColumn('no_driver');
        });
    }
};
