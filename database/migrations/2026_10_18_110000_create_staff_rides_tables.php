<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Staff transport (docs/plans/sites-shifts.md, P5): a fleet car taking staff
 * home (or to work). A manager or the day's closer asks for a ride from a
 * site at a time with its riders; a driver claims it with a free car, sets
 * off, drops each rider and finishes (StaffRideService).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_rides', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('stock_location_id')->constrained('stock_locations')->cascadeOnDelete();
            $table->dateTime('departs_at');
            // requested | claimed | departed | done | cancelled
            $table->string('status', 12)->default('requested');
            $table->foreignId('driver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('vehicle_id')->nullable()->constrained('vehicles')->nullOnDelete();
            $table->timestamp('claimed_at')->nullable();
            $table->timestamp('departed_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->string('note', 500)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'departs_at']);
        });

        Schema::create('staff_ride_riders', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('staff_ride_id')->constrained('staff_rides')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // Copied from users.home_area when the ride is asked for.
            $table->string('drop_off', 120)->nullable();
            // riding | dropped | no_show | not_riding
            $table->string('status', 12)->default('riding');
            $table->timestamp('dropped_at')->nullable();
            $table->timestamps();

            $table->unique(['staff_ride_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_ride_riders');
        Schema::dropIfExists('staff_rides');
    }
};
