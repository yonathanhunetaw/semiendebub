<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The rota (docs/plans/sites-shifts.md, P3). Stores and Remote Hubs only.
 *
 *   shifts          one person at one site from a time to a time. The manager
 *                   drafts and publishes; the person accepts or asks for a
 *                   change (RotaService). A shift may carry the opening or
 *                   closing duty, which names them on that site day.
 *   staffing_rules  "at least N sellers between 10:00 and 14:00 on weekdays":
 *                   the rota shows the gaps.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shifts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('stock_location_id')->constrained('stock_locations')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            // none | opener | closer
            $table->string('duty', 8)->default('none');
            // draft | published | accepted | change_requested | cancelled
            $table->string('status', 20)->default('draft');
            $table->timestamp('published_at')->nullable();
            $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('accepted_at')->nullable();
            $table->string('change_note', 500)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['stock_location_id', 'starts_at']);
            $table->index(['user_id', 'starts_at']);
        });

        Schema::create('staffing_rules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('stock_location_id')->constrained('stock_locations')->cascadeOnDelete();
            // [0..6], 0 = Sunday
            $table->json('weekdays');
            $table->time('starts_at');
            $table->time('ends_at');
            // seller | stock_keeper | any
            $table->string('role', 16)->default('any');
            $table->unsignedTinyInteger('min_people')->default(1);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staffing_rules');
        Schema::dropIfExists('shifts');
    }
};
