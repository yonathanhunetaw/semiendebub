<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sites and keys (docs/plans/sites-shifts.md, P1).
 *
 * A site is a stock_locations node of kind store, remote_hub or main_hub.
 *
 *   site_hours            when a site opens and closes, per weekday (0 = Sunday)
 *   site_hour_exceptions  one date that differs: closed, or other hours
 *   custody_keys          the one key of a site or a vehicle and who holds it
 *   key_handovers         every hand-over of a key; the holder changes only
 *                         when the receiver accepts (KeyCustodyService)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_hours', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('stock_location_id')->constrained('stock_locations')->cascadeOnDelete();
            $table->unsignedTinyInteger('weekday');
            $table->time('opens_at')->nullable();
            $table->time('closes_at')->nullable();
            $table->boolean('closed')->default(false);
            $table->timestamps();

            $table->unique(['stock_location_id', 'weekday']);
        });

        Schema::create('site_hour_exceptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('stock_location_id')->constrained('stock_locations')->cascadeOnDelete();
            $table->date('date');
            $table->boolean('closed')->default(true);
            $table->time('opens_at')->nullable();
            $table->time('closes_at')->nullable();
            $table->string('note', 255)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['stock_location_id', 'date']);
        });

        Schema::create('custody_keys', function (Blueprint $table): void {
            $table->id();
            $table->morphs('keyable');
            $table->foreignId('holder_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('held_since')->nullable();
            $table->timestamps();

            $table->unique(['keyable_type', 'keyable_id']);
        });

        Schema::create('key_handovers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('custody_key_id')->constrained('custody_keys')->cascadeOnDelete();
            $table->foreignId('from_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('to_id')->constrained('users')->cascadeOnDelete();
            // claimed | accepted | rejected | cancelled | forced
            $table->string('status', 16);
            $table->string('reason', 32)->nullable();
            $table->string('note', 500)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();

            $table->index(['to_id', 'status']);
            $table->index(['custody_key_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('key_handovers');
        Schema::dropIfExists('custody_keys');
        Schema::dropIfExists('site_hour_exceptions');
        Schema::dropIfExists('site_hours');
    }
};
