<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Clock in and out (docs/plans/sites-shifts.md, P4). One row per stretch at
 * a site, linked to the shift it covers when there is one. A manager can
 * clock someone in or out, or fix a row; a forgotten clock-out is closed by
 * the sweep and flagged for the manager to look at (AttendanceService).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('time_entries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('stock_location_id')->constrained('stock_locations')->cascadeOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained('shifts')->nullOnDelete();
            $table->timestamp('clock_in_at');
            $table->timestamp('clock_out_at')->nullable();
            // qr | opening | manager
            $table->string('in_method', 12);
            // qr | closing | manager | auto
            $table->string('out_method', 12)->nullable();
            $table->foreignId('in_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('out_by')->nullable()->constrained('users')->nullOnDelete();
            // late, early_leave, unscheduled, auto_closed, fixed
            $table->json('flags')->nullable();
            $table->string('note', 500)->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['user_id', 'clock_out_at']);
            $table->index(['stock_location_id', 'clock_in_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('time_entries');
    }
};
